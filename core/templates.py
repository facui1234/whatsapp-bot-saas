"""Genera las plantillas Excel de ejemplo (entregas, precios, documentos)
que el usuario descarga, completa y vuelve a subir desde la pantalla
Importar."""
from __future__ import annotations

import io

import pandas as pd

FILAS_EJEMPLO_ENTREGAS = [
    dict(fecha="2026-06-03", proveedor="PetroSur SA", contrato_oc="OC-1001", remito="R-5001",
         producto="Medanito", volumen=5000, unidad_volumen="m3", punto_entrega="Terminal Puerto Rosales",
         periodo_contable="2026-06", estado="Recibida sin facturar"),
    dict(fecha="2026-06-05", proveedor="PetroSur SA", contrato_oc="OC-1002", remito="R-5002",
         producto="Medanito", volumen=3000, unidad_volumen="m3", punto_entrega="Terminal Puerto Rosales",
         periodo_contable="2026-06", estado="Recibida sin facturar"),
    dict(fecha="2026-06-10", proveedor="Crudos del Norte SRL", contrato_oc="OC-2001", remito="R-7001",
         producto="Escalante", volumen=2500, unidad_volumen="m3", punto_entrega="Batería Norte",
         periodo_contable="2026-06", estado="Recibida sin facturar"),
    dict(fecha="2026-06-15", proveedor="Crudos del Norte SRL", contrato_oc="OC-2002", remito="R-7002",
         producto="Escalante", volumen=1800, unidad_volumen="m3", punto_entrega="Batería Norte",
         periodo_contable="2026-06", estado="Recibida sin facturar"),
    dict(fecha="2026-06-20", proveedor="YPF Trading", contrato_oc="OC-3001", remito="R-9001",
         producto="Medanito", volumen=4000, unidad_volumen="bbl", punto_entrega="Oleoducto Allen",
         periodo_contable="2026-06", estado="Recibida sin facturar"),
]

FILAS_EJEMPLO_PRECIOS = [
    dict(periodo="2026-06", producto="Medanito", proveedor="PetroSur SA", precio=63.50,
         moneda="USD", tipo="final", fuente="Boletín oficial"),
    dict(periodo="2026-06", producto="Escalante", proveedor="Crudos del Norte SRL", precio=61.00,
         moneda="USD", tipo="estimado", fuente="Estimación interna"),
    dict(periodo="2026-06", producto="Medanito", proveedor="YPF Trading", precio=64.20,
         moneda="USD", tipo="estimado", fuente="Estimación interna"),
    dict(periodo="2026-05", producto="Medanito", proveedor="PetroSur SA", precio=59.80,
         moneda="USD", tipo="final", fuente="Boletín oficial"),
    dict(periodo="2026-05", producto="Escalante", proveedor="Crudos del Norte SRL", precio=58.00,
         moneda="USD", tipo="final", fuente="Boletín oficial"),
]

FILAS_EJEMPLO_DOCUMENTOS = [
    dict(tipo="FACTURA", numero="A-0001-00012345", fecha="2026-06-04", proveedor="PetroSur SA",
         neto_sin_iva=317500, moneda="USD", tipo_cambio="", volumen_facturado=5000,
         precio_unitario=63.50, referencia="R-5001"),
    dict(tipo="FACTURA", numero="A-0001-00012346", fecha="2026-06-06", proveedor="PetroSur SA",
         neto_sin_iva=180000, moneda="USD", tipo_cambio="", volumen_facturado=3000,
         precio_unitario=60.00, referencia="R-5002"),
    dict(tipo="ND", numero="ND-0001-00000010", fecha="2026-06-20", proveedor="PetroSur SA",
         neto_sin_iva=10500, moneda="USD", tipo_cambio="", volumen_facturado="",
         precio_unitario="", referencia="R-5002"),
    dict(tipo="NC", numero="NC-0002-00000021", fecha="2026-06-18", proveedor="Crudos del Norte SRL",
         neto_sin_iva=5000, moneda="USD", tipo_cambio="", volumen_facturado="",
         precio_unitario="", referencia="R-7001"),
    dict(tipo="FACTURA", numero="C-0003-00055501", fecha="2026-06-23", proveedor="YPF Trading",
         neto_sin_iva=138672000, moneda="ARS", tipo_cambio=1080, volumen_facturado=2000,
         precio_unitario=64.20, referencia="R-9002"),
]


def _a_bytes(filas: list[dict], nombre_hoja: str) -> bytes:
    df = pd.DataFrame(filas)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=nombre_hoja)
    return buffer.getvalue()


def plantilla_entregas() -> bytes:
    return _a_bytes(FILAS_EJEMPLO_ENTREGAS, "entregas")


def plantilla_precios() -> bytes:
    return _a_bytes(FILAS_EJEMPLO_PRECIOS, "precios")


def plantilla_documentos() -> bytes:
    return _a_bytes(FILAS_EJEMPLO_DOCUMENTOS, "documentos")
