"""Puente entre la base de datos (core/db.py) y la lógica pura de negocio
(core/reconciliation.py, core/matching.py).

Las páginas de Streamlit llaman a las funciones de este módulo; no acceden
a SQL directamente ni a los dataclasses de reconciliación a mano.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from core import db, matching, reconciliation as rec


def _entrega_dataclass(row: sqlite3.Row) -> rec.Entrega:
    return rec.Entrega(
        id=row["id"],
        proveedor=row["proveedor"],
        producto=row["producto"],
        periodo_contable=row["periodo_contable"],
        volumen=row["volumen"],
    )


def precios_dataclasses(conn: sqlite3.Connection) -> list[rec.Precio]:
    filas = db.listar(conn, "precios", orden="fecha_carga ASC")
    return [
        rec.Precio(
            periodo=f["periodo"], producto=f["producto"], proveedor=f["proveedor"],
            precio=f["precio"], moneda=f["moneda"], tipo=f["tipo"], fecha_carga=f["fecha_carga"],
        )
        for f in filas
    ]



def obtener_tasa_referencia(conn: sqlite3.Connection, periodo: str, moneda: str) -> float | None:
    fila = conn.execute(
        "SELECT tasa FROM tipos_cambio WHERE periodo = ? AND moneda = ?", (periodo, moneda)
    ).fetchone()
    return fila["tasa"] if fila else None


def documentos_imputados_de_entrega(conn: sqlite3.Connection, entrega_id: int) -> list[dict]:
    """Devuelve, por cada documento imputado a la entrega, la fila combinada
    imputación+documento (para mostrar el detalle paso a paso en pantalla)."""
    filas = conn.execute(
        """SELECT imp.id AS imputacion_id, imp.monto_imputado, imp.volumen_imputado,
                  imp.metodo, imp.confianza,
                  doc.id AS documento_id, doc.tipo, doc.numero, doc.fecha, doc.moneda,
                  doc.tipo_cambio, doc.referencia
           FROM imputaciones imp
           JOIN documentos doc ON doc.id = imp.documento_id
           WHERE imp.entrega_id = ?
           ORDER BY doc.fecha""",
        (entrega_id,),
    ).fetchall()
    return db.filas_a_dicts(filas)


def _documentos_imputados_dataclasses(filas: list[dict]) -> list[rec.DocumentoImputado]:
    return [
        rec.DocumentoImputado(
            tipo=f["tipo"], moneda=f["moneda"], monto_imputado=f["monto_imputado"],
            volumen_imputado=f["volumen_imputado"], tipo_cambio=f["tipo_cambio"],
        )
        for f in filas
    ]


def calcular_resultado_entrega(conn: sqlite3.Connection, entrega_row: sqlite3.Row) -> rec.ResultadoConciliacion:
    entrega = _entrega_dataclass(entrega_row)
    precios = precios_dataclasses(conn)
    docs_filas = documentos_imputados_de_entrega(conn, entrega.id)
    documentos = _documentos_imputados_dataclasses(docs_filas)

    precio = rec.seleccionar_precio_aplicable(precios, entrega.periodo_contable, entrega.producto, entrega.proveedor)
    tasa_referencia = None
    if precio is not None:
        for d in documentos:
            if d.moneda != precio.moneda:
                tasa_referencia = obtener_tasa_referencia(conn, entrega.periodo_contable, d.moneda)
                break

    tolerancia_global = db.obtener_tolerancia_global(conn)
    tolerancias_prov = db.obtener_tolerancias_proveedor(conn)

    return rec.calcular_conciliacion_entrega(
        entrega, precios, documentos,
        tolerancia_global=tolerancia_global,
        tolerancias_por_proveedor=tolerancias_prov,
        tasa_cambio_referencia=tasa_referencia,
    )


def calcular_todas(conn: sqlite3.Connection, periodo: str | None = None) -> list[tuple[sqlite3.Row, rec.ResultadoConciliacion]]:
    entregas = db.listar(conn, "entregas", orden="periodo_contable DESC, id DESC")
    if periodo:
        entregas = [e for e in entregas if e["periodo_contable"] == periodo]
    return [(e, calcular_resultado_entrega(conn, e)) for e in entregas]


def periodos_disponibles(conn: sqlite3.Connection) -> list[str]:
    filas = conn.execute(
        "SELECT DISTINCT periodo_contable AS p FROM entregas ORDER BY p DESC"
    ).fetchall()
    return [f["p"] for f in filas]


# ---------------------------------------------------------------------------
# Matcheo automático
# ---------------------------------------------------------------------------

def _entregas_candidatas(conn: sqlite3.Connection) -> list[matching.EntregaCandidata]:
    filas = db.listar(conn, "entregas")
    return [
        matching.EntregaCandidata(
            id=f["id"], proveedor=f["proveedor"], periodo_contable=f["periodo_contable"],
            contrato_oc=f["contrato_oc"], remito=f["remito"], volumen=f["volumen"],
        )
        for f in filas
    ]


def documentos_sin_imputar(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT doc.* FROM documentos doc
           LEFT JOIN imputaciones imp ON imp.documento_id = doc.id
           WHERE imp.id IS NULL
           ORDER BY doc.fecha DESC"""
    ).fetchall()


@dataclass
class SugerenciaConDetalle:
    entrega_id: int
    proveedor: str
    remito: str | None
    contrato_oc: str | None
    periodo_contable: str
    volumen: float
    metodo: str
    confianza: float


def sugerencias_para_documento(conn: sqlite3.Connection, documento_row: sqlite3.Row) -> matching.ResultadoMatch:
    doc = matching.DocumentoAMatchear(
        id=documento_row["id"], proveedor=documento_row["proveedor"], periodo_contable=None,
        referencia=documento_row["referencia"], volumen_facturado=documento_row["volumen_facturado"],
    )
    entregas = _entregas_candidatas(conn)
    return matching.emparejar_documento(doc, entregas)


def aplicar_matches_automaticos(conn: sqlite3.Connection, usuario: str = db.USUARIO_POR_DEFECTO) -> int:
    """Corre el matcheo exacto sobre todos los documentos sin imputar y crea
    la imputación automáticamente cuando hay un único candidato exacto.
    Devuelve la cantidad de imputaciones creadas."""
    creadas = 0
    for doc_row in documentos_sin_imputar(conn):
        resultado = sugerencias_para_documento(conn, doc_row)
        if resultado.match_automatico is not None:
            db.insertar(
                conn, "imputaciones",
                dict(
                    entrega_id=resultado.match_automatico.entrega_id,
                    documento_id=doc_row["id"],
                    monto_imputado=doc_row["neto_sin_iva"],
                    volumen_imputado=doc_row["volumen_facturado"],
                    metodo=resultado.match_automatico.metodo,
                    confianza=resultado.match_automatico.confianza,
                    creado_por=usuario,
                    creado_en=db.ahora(),
                ),
                usuario=usuario,
            )
            creadas += 1
    return creadas
