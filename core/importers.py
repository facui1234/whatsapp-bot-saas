"""Importación de Excel (plantillas) y de CSV de SAP (FBL1N / MB51).

Regla de oro: se valida TODO antes de guardar nada. Si hay errores, no se
inserta ni una fila (transacción atómica del lado de la base, y acá
además ni siquiera se intenta insertar si `validar_dataframe` devolvió
algún error).
"""
from __future__ import annotations

import json
import sqlite3

import pandas as pd

from core import db, repository as repo, validators as val

CAMPOS_ENTREGAS = [c.nombre for c in val.COLUMNAS_ENTREGAS]
CAMPOS_PRECIOS = [c.nombre for c in val.COLUMNAS_PRECIOS]
CAMPOS_DOCUMENTOS = [c.nombre for c in val.COLUMNAS_DOCUMENTOS]

DEFAULTS_ENTREGAS = {"estado": "Recibida sin facturar", "unidad_volumen": "m3"}


def leer_excel(archivo) -> pd.DataFrame:
    """`archivo` es un file-like (p.ej. lo que devuelve st.file_uploader)."""
    df = pd.read_excel(archivo, dtype=str)
    return df.where(pd.notna(df), None)


def leer_csv(archivo) -> pd.DataFrame:
    """Lee un CSV tolerando los formatos típicos de exportación de SAP
    (separador ';' o ',', codificación UTF-8 o Latin-1)."""
    contenido = archivo.read()
    if isinstance(contenido, str):
        contenido = contenido.encode("utf-8")

    for codificacion in ("utf-8-sig", "latin-1"):
        for separador in (";", ",", "\t"):
            try:
                import io as _io
                df = pd.read_csv(
                    _io.BytesIO(contenido), sep=separador, dtype=str, encoding=codificacion,
                    engine="python",
                )
                if df.shape[1] > 1:
                    return df.where(pd.notna(df), None)
            except Exception:
                continue
    raise ValueError(
        "No se pudo leer el CSV. Probá exportarlo de nuevo desde SAP en UTF-8 "
        "separado por ';' o ','."
    )


def _aplicar_defaults(df: pd.DataFrame, defaults: dict[str, str]) -> pd.DataFrame:
    df = df.copy()
    for campo, valor in defaults.items():
        if campo in df.columns:
            df[campo] = df[campo].apply(lambda v, valor=valor: valor if v is None or str(v).strip() == "" else v)
    return df


def _fila_a_dict(row: pd.Series, campos: list[str]) -> dict:
    datos = {}
    for c in campos:
        valor = row.get(c)
        if valor is None or (isinstance(valor, float) and pd.isna(valor)) or str(valor).strip() == "":
            datos[c] = None
        else:
            datos[c] = valor
    return datos


def _a_numero(valor):
    return None if valor is None else float(valor)


def validar_y_preparar_entregas(df: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    df = _aplicar_defaults(df, DEFAULTS_ENTREGAS)
    errores = val.validar_dataframe(df, val.COLUMNAS_ENTREGAS)
    if errores:
        return errores, []
    filas = []
    for _, row in df.iterrows():
        d = _fila_a_dict(row, CAMPOS_ENTREGAS)
        d["volumen"] = _a_numero(d["volumen"])
        filas.append(d)
    return [], filas


def validar_y_preparar_precios(df: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    errores = val.validar_dataframe(df, val.COLUMNAS_PRECIOS)
    if errores:
        return errores, []
    filas = []
    for _, row in df.iterrows():
        d = _fila_a_dict(row, CAMPOS_PRECIOS)
        d["precio"] = _a_numero(d["precio"])
        filas.append(d)
    return [], filas


def validar_y_preparar_documentos(df: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    errores = val.validar_dataframe(df, val.COLUMNAS_DOCUMENTOS)
    if errores:
        return errores, []
    filas = []
    for _, row in df.iterrows():
        d = _fila_a_dict(row, CAMPOS_DOCUMENTOS)
        for campo in ("neto_sin_iva", "tipo_cambio", "volumen_facturado", "precio_unitario"):
            d[campo] = _a_numero(d[campo])
        filas.append(d)
    return [], filas


def importar_entregas(conn: sqlite3.Connection, filas: list[dict], usuario: str) -> int:
    ahora = db.ahora()
    for d in filas:
        d["creado_por"] = usuario
        d["creado_en"] = ahora
        db.insertar(conn, "entregas", d, usuario=usuario)
    db.registrar_auditoria(conn, "entregas", None, "importar", f"{len(filas)} filas importadas", usuario)
    return len(filas)


def importar_precios(conn: sqlite3.Connection, filas: list[dict], usuario: str) -> int:
    ahora = db.ahora()
    combos_afectados = set()
    for d in filas:
        d["fecha_carga"] = ahora
        d["creado_por"] = usuario
        db.insertar(conn, "precios", d, usuario=usuario)
        combos_afectados.add((d["periodo"], d["producto"], d["proveedor"]))
    for periodo, producto, proveedor in combos_afectados:
        repo.generar_ajustes_posteriores_si_corresponde(conn, periodo, producto, proveedor, usuario)
    db.registrar_auditoria(conn, "precios", None, "importar", f"{len(filas)} filas importadas", usuario)
    return len(filas)


def importar_documentos(conn: sqlite3.Connection, filas: list[dict], usuario: str, origen: str = "excel") -> int:
    ahora = db.ahora()
    for d in filas:
        d["creado_por"] = usuario
        d["creado_en"] = ahora
        d["origen"] = origen
        db.insertar(conn, "documentos", d, usuario=usuario)
    db.registrar_auditoria(conn, "documentos", None, "importar", f"{len(filas)} filas importadas ({origen})", usuario)
    return len(filas)


# ---------------------------------------------------------------------------
# Mapeo de columnas SAP (se guarda para la próxima vez)
# ---------------------------------------------------------------------------

def guardar_mapeo_sap(conn: sqlite3.Connection, nombre: str, mapeo: dict[str, str]) -> None:
    conn.execute(
        """INSERT INTO sap_mapeos (nombre, mapeo_json, fecha_carga) VALUES (?, ?, ?)
           ON CONFLICT(nombre) DO UPDATE SET mapeo_json = excluded.mapeo_json, fecha_carga = excluded.fecha_carga""",
        (nombre, json.dumps(mapeo, ensure_ascii=False), db.ahora()),
    )


def obtener_mapeo_sap(conn: sqlite3.Connection, nombre: str) -> dict[str, str] | None:
    fila = conn.execute("SELECT mapeo_json FROM sap_mapeos WHERE nombre = ?", (nombre,)).fetchone()
    return json.loads(fila["mapeo_json"]) if fila else None


def listar_mapeos_sap(conn: sqlite3.Connection) -> list[str]:
    filas = conn.execute("SELECT nombre FROM sap_mapeos ORDER BY nombre").fetchall()
    return [f["nombre"] for f in filas]


def aplicar_mapeo_columnas(df: pd.DataFrame, mapeo: dict[str, str], campos_sistema: list[str]) -> pd.DataFrame:
    """`mapeo` es {campo_del_sistema: columna_del_csv}. Devuelve un DataFrame
    con las columnas del sistema, tomando los valores de las columnas
    mapeadas (o vacío si un campo opcional no se mapeó)."""
    datos = {}
    for campo in campos_sistema:
        columna_csv = mapeo.get(campo)
        if columna_csv and columna_csv in df.columns:
            datos[campo] = df[columna_csv]
        else:
            datos[campo] = [None] * len(df)
    return pd.DataFrame(datos)
