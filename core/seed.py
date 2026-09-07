"""Carga de datos de ejemplo para que la app se vea funcionando de entrada.

Se ejecuta una sola vez, automáticamente, la primera vez que se abre la app
(cuando la tabla `entregas` está vacía). Los datos ilustran los distintos
casos del motor de conciliación: falta ND, falta NC, conciliada, sin precio
cargado y diferencia de tipo de cambio.
"""
from __future__ import annotations

import sqlite3

from core import db

USUARIO_SEED = "seed"


def cargar_datos_demo(conn: sqlite3.Connection) -> None:
    if not db.esta_vacia(conn):
        return

    db.set_config(conn, "tolerancia_global", "500")

    conn.execute(
        "INSERT INTO tipos_cambio (periodo, moneda, tasa, fecha_carga) VALUES (?, ?, ?, ?)",
        ("2026-06", "ARS", 1050.0, db.ahora()),
    )

    entregas = [
        # id 1: conciliada exacto (factura final ya emitida)
        dict(
            fecha="2026-06-03", proveedor="PetroSur SA", contrato_oc="OC-1001", remito="R-5001",
            producto="Medanito", volumen=5000, unidad_volumen="m3", punto_entrega="Terminal Puerto Rosales",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
        # id 2: facturada a precio provisorio, falta ND (precio subió)
        dict(
            fecha="2026-06-05", proveedor="PetroSur SA", contrato_oc="OC-1002", remito="R-5002",
            producto="Medanito", volumen=3000, unidad_volumen="m3", punto_entrega="Terminal Puerto Rosales",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
        # id 3: falta NC (facturaron de más)
        dict(
            fecha="2026-06-10", proveedor="Crudos del Norte SRL", contrato_oc="OC-2001", remito="R-7001",
            producto="Escalante", volumen=2500, unidad_volumen="m3", punto_entrega="Batería Norte",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
        # id 4: sin ningún documento todavía
        dict(
            fecha="2026-06-15", proveedor="Crudos del Norte SRL", contrato_oc="OC-2002", remito="R-7002",
            producto="Escalante", volumen=1800, unidad_volumen="m3", punto_entrega="Batería Norte",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
        # id 5: sin precio cargado todavía (Cañadón Seco no tiene precio en el seed)
        dict(
            fecha="2026-06-20", proveedor="YPF Trading", contrato_oc="OC-3001", remito="R-9001",
            producto="Cañadón Seco", volumen=4000, unidad_volumen="m3", punto_entrega="Oleoducto Allen",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
        # id 6: factura en ARS -> diferencia de tipo de cambio
        dict(
            fecha="2026-06-22", proveedor="YPF Trading", contrato_oc="OC-3002", remito="R-9002",
            producto="Medanito", volumen=2000, unidad_volumen="m3", punto_entrega="Oleoducto Allen",
            periodo_contable="2026-06", estado="Recibida sin facturar",
        ),
    ]
    entrega_ids = {}
    for i, e in enumerate(entregas, start=1):
        e["creado_por"] = USUARIO_SEED
        e["creado_en"] = db.ahora()
        entrega_ids[i] = db.insertar(conn, "entregas", e, usuario=USUARIO_SEED)

    precios = [
        dict(periodo="2026-06", producto="Medanito", proveedor="PetroSur SA", precio=63.50,
             moneda="USD", tipo="final", fuente="Boletín oficial", fecha_carga="2026-06-01T09:00:00"),
        dict(periodo="2026-06", producto="Escalante", proveedor="Crudos del Norte SRL", precio=61.00,
             moneda="USD", tipo="estimado", fuente="Estimación interna", fecha_carga="2026-06-01T09:05:00"),
        dict(periodo="2026-06", producto="Medanito", proveedor="YPF Trading", precio=64.20,
             moneda="USD", tipo="estimado", fuente="Estimación interna", fecha_carga="2026-06-01T09:10:00"),
    ]
    for p in precios:
        p["creado_por"] = USUARIO_SEED
        db.insertar(conn, "precios", p, usuario=USUARIO_SEED)

    documentos = [
        # Factura para entrega 1, a precio final, coincide -> conciliada
        dict(tipo="FACTURA", numero="A-0001-00012345", fecha="2026-06-04", proveedor="PetroSur SA",
             neto_sin_iva=5000 * 63.50, moneda="USD", tipo_cambio=None, volumen_facturado=5000,
             precio_unitario=63.50, referencia="R-5001", origen="manual"),
        # Factura provisoria para entrega 2, a un precio viejo más bajo -> falta ND
        dict(tipo="FACTURA", numero="A-0001-00012346", fecha="2026-06-06", proveedor="PetroSur SA",
             neto_sin_iva=3000 * 60.00, moneda="USD", tipo_cambio=None, volumen_facturado=3000,
             precio_unitario=60.00, referencia="R-5002", origen="manual"),
        # Factura para entrega 3, de más -> falta NC
        dict(tipo="FACTURA", numero="B-0002-00099887", fecha="2026-06-11", proveedor="Crudos del Norte SRL",
             neto_sin_iva=2500 * 63.00, moneda="USD", tipo_cambio=None, volumen_facturado=2500,
             precio_unitario=63.00, referencia="R-7001", origen="manual"),
        # Factura en ARS para entrega 6, tipo de cambio distinto al de referencia
        dict(tipo="FACTURA", numero="C-0003-00055501", fecha="2026-06-23", proveedor="YPF Trading",
             neto_sin_iva=2000 * 64.20 * 1080.0, moneda="ARS", tipo_cambio=1080.0, volumen_facturado=2000,
             precio_unitario=64.20, referencia="R-9002", origen="manual"),
    ]
    doc_ids = []
    for d in documentos:
        d["creado_por"] = USUARIO_SEED
        d["creado_en"] = db.ahora()
        doc_ids.append(db.insertar(conn, "documentos", d, usuario=USUARIO_SEED))

    imputaciones = [
        dict(entrega_id=entrega_ids[1], documento_id=doc_ids[0], monto_imputado=5000 * 63.50,
             volumen_imputado=5000, metodo="exacto", confianza=1.0),
        dict(entrega_id=entrega_ids[2], documento_id=doc_ids[1], monto_imputado=3000 * 60.00,
             volumen_imputado=3000, metodo="exacto", confianza=1.0),
        dict(entrega_id=entrega_ids[3], documento_id=doc_ids[2], monto_imputado=2500 * 63.00,
             volumen_imputado=2500, metodo="exacto", confianza=1.0),
        dict(entrega_id=entrega_ids[6], documento_id=doc_ids[3], monto_imputado=2000 * 64.20 * 1080.0,
             volumen_imputado=2000, metodo="exacto", confianza=1.0),
    ]
    for imp in imputaciones:
        imp["creado_por"] = USUARIO_SEED
        imp["creado_en"] = db.ahora()
        db.insertar(conn, "imputaciones", imp, usuario=USUARIO_SEED)

    # Reflejar estados de negocio razonables en las entregas de ejemplo.
    db.actualizar(conn, "entregas", entrega_ids[1], {"estado": "Facturada a precio provisorio"}, usuario=USUARIO_SEED)
    db.actualizar(conn, "entregas", entrega_ids[2], {"estado": "Ajuste pendiente"}, usuario=USUARIO_SEED)
    db.actualizar(conn, "entregas", entrega_ids[3], {"estado": "Ajuste pendiente"}, usuario=USUARIO_SEED)
    db.actualizar(conn, "entregas", entrega_ids[6], {"estado": "Ajuste pendiente"}, usuario=USUARIO_SEED)

    db.registrar_auditoria(conn, "sistema", None, "seed", "Carga inicial de datos de ejemplo", usuario=USUARIO_SEED)
