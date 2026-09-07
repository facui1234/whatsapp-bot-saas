"""Validación de datos antes de guardarlos, para las importaciones de Excel
y de SAP. Nada se guarda a medias: primero se valida TODO el archivo y
recién si no hay errores se inserta.

Cada validación devuelve una lista de errores en castellano con
`{"fila": ..., "columna": ..., "mensaje": ...}` (fila = número de fila del
Excel, contando el encabezado como fila 1).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd

FECHA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PERIODO_RE = re.compile(r"^\d{4}-\d{2}$")


@dataclass
class Columna:
    nombre: str
    requerida: bool = True
    tipo: str = "texto"  # texto | numero | fecha | periodo | opciones
    opciones: list[str] = field(default_factory=list)
    permite_negativo: bool = False  # sólo aplica a "numero"


def _validar_valor(fila_num: int, col: Columna, valor) -> dict | None:
    vacio = valor is None or (isinstance(valor, float) and pd.isna(valor)) or str(valor).strip() == ""

    if vacio:
        if col.requerida:
            return dict(fila=fila_num, columna=col.nombre, mensaje="Es un dato obligatorio y está vacío.")
        return None

    if col.tipo == "numero":
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            return dict(fila=fila_num, columna=col.nombre, mensaje=f"'{valor}' no es un número válido.")
        if not col.permite_negativo and numero <= 0:
            return dict(fila=fila_num, columna=col.nombre, mensaje="Tiene que ser un número mayor a cero.")

    elif col.tipo == "fecha":
        if not FECHA_RE.match(str(valor).strip()):
            return dict(fila=fila_num, columna=col.nombre, mensaje=f"'{valor}' no tiene formato de fecha AAAA-MM-DD.")
        try:
            datetime.strptime(str(valor).strip(), "%Y-%m-%d")
        except ValueError:
            return dict(fila=fila_num, columna=col.nombre, mensaje=f"'{valor}' no es una fecha válida.")

    elif col.tipo == "periodo":
        if not PERIODO_RE.match(str(valor).strip()):
            return dict(fila=fila_num, columna=col.nombre, mensaje=f"'{valor}' no tiene formato de período AAAA-MM.")

    elif col.tipo == "opciones":
        if str(valor).strip() not in col.opciones:
            return dict(
                fila=fila_num, columna=col.nombre,
                mensaje=f"'{valor}' no es válido. Opciones permitidas: {', '.join(col.opciones)}.",
            )

    return None


def validar_dataframe(df: pd.DataFrame, columnas: list[Columna]) -> list[dict]:
    errores: list[dict] = []

    columnas_faltantes = [c.nombre for c in columnas if c.nombre not in df.columns]
    if columnas_faltantes:
        errores.append(dict(
            fila=1, columna=", ".join(columnas_faltantes),
            mensaje="Faltan estas columnas en el archivo (revisá los encabezados contra la plantilla).",
        ))
        return errores  # sin las columnas no tiene sentido seguir validando fila por fila

    if len(df) == 0:
        errores.append(dict(fila=1, columna="-", mensaje="El archivo no tiene ninguna fila de datos."))
        return errores

    for i, row in df.iterrows():
        fila_num = i + 2  # +1 por índice base 0, +1 por el encabezado
        for col in columnas:
            error = _validar_valor(fila_num, col, row.get(col.nombre))
            if error:
                errores.append(error)

    return errores


# ---------------------------------------------------------------------------
# Definición de columnas por entidad (usada por plantillas, importador de
# Excel e importador de SAP una vez mapeadas las columnas del CSV)
# ---------------------------------------------------------------------------

COLUMNAS_ENTREGAS = [
    Columna("fecha", tipo="fecha"),
    Columna("proveedor"),
    Columna("contrato_oc", requerida=False),
    Columna("remito", requerida=False),
    Columna("producto"),
    Columna("volumen", tipo="numero"),
    Columna("unidad_volumen", tipo="opciones", opciones=["m3", "bbl"]),
    Columna("punto_entrega", requerida=False),
    Columna("periodo_contable", tipo="periodo"),
    Columna("estado", requerida=False, tipo="opciones", opciones=[
        "Recibida sin facturar", "Facturada a precio provisorio", "Ajuste pendiente", "Cerrada",
    ]),
]

COLUMNAS_PRECIOS = [
    Columna("periodo", tipo="periodo"),
    Columna("producto"),
    Columna("proveedor"),
    Columna("precio", tipo="numero"),
    Columna("moneda", tipo="opciones", opciones=["USD", "ARS"]),
    Columna("tipo", tipo="opciones", opciones=["estimado", "final"]),
    Columna("fuente", requerida=False),
]

COLUMNAS_DOCUMENTOS = [
    Columna("tipo", tipo="opciones", opciones=["FACTURA", "ND", "NC"]),
    Columna("numero"),
    Columna("fecha", tipo="fecha"),
    Columna("proveedor"),
    Columna("neto_sin_iva", tipo="numero"),
    Columna("moneda", tipo="opciones", opciones=["USD", "ARS"]),
    Columna("tipo_cambio", requerida=False, tipo="numero"),
    Columna("volumen_facturado", requerida=False, tipo="numero", permite_negativo=True),
    Columna("precio_unitario", requerida=False, tipo="numero"),
    Columna("referencia", requerida=False),
]
