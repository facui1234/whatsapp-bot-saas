"""Tests de integración del cierre contable contra una base SQLite temporal:
cerrar un período, exportar el asiento de provisión, no permitir volver a
cerrarlo, y generar ajustes posteriores cuando un precio pasa de estimado a
final después del cierre."""
from __future__ import annotations

from core import db, repository as repo

PERIODO = "2026-06"


def _armar_escenario(conn):
    db.set_config(conn, "tolerancia_global", "10")
    entrega_id = db.insertar(conn, "entregas", dict(
        fecha="2026-06-10", proveedor="Crudos del Norte SRL", contrato_oc="OC-1", remito="R-1",
        producto="Escalante", volumen=1000, unidad_volumen="m3", punto_entrega="Batería Norte",
        periodo_contable=PERIODO, estado="Recibida sin facturar",
    ))
    db.insertar(conn, "precios", dict(
        periodo=PERIODO, producto="Escalante", proveedor="Crudos del Norte SRL", precio=60.0,
        moneda="USD", tipo="estimado", fuente="test", fecha_carga="2026-06-01T00:00:00",
    ))
    doc_id = db.insertar(conn, "documentos", dict(
        tipo="FACTURA", numero="F-1", fecha="2026-06-11", proveedor="Crudos del Norte SRL",
        neto_sin_iva=1000 * 55.0, moneda="USD", tipo_cambio=None, volumen_facturado=1000,
        precio_unitario=55.0, referencia="R-1", origen="manual",
    ))
    repo.crear_imputacion(conn, entrega_id, doc_id, monto_imputado=1000 * 55.0,
                           volumen_imputado=1000, metodo="exacto", confianza=1.0)
    return entrega_id


def test_cerrar_periodo_congela_snapshot_y_bloquea_la_entrega(db_conn):
    entrega_id = _armar_escenario(db_conn)

    resultado = repo.calcular_resultado_entrega(db_conn, db.obtener_por_id(db_conn, "entregas", entrega_id))
    assert resultado.estado == "falta_nd"  # 60 vs 55 -> falta ND por 5000

    assert not repo.periodo_esta_cerrado(db_conn, PERIODO)
    repo.cerrar_periodo(db_conn, PERIODO, usuario="test")
    assert repo.periodo_esta_cerrado(db_conn, PERIODO)

    entrega = db.obtener_por_id(db_conn, "entregas", entrega_id)
    assert entrega["estado"] == "Cerrada"


def test_no_se_puede_cerrar_dos_veces(db_conn):
    _armar_escenario(db_conn)
    repo.cerrar_periodo(db_conn, PERIODO, usuario="test")
    try:
        repo.cerrar_periodo(db_conn, PERIODO, usuario="test")
        assert False, "tendría que haber lanzado ValueError"
    except ValueError:
        pass


def test_asiento_de_provision_agrupa_por_cuenta_y_proveedor(db_conn):
    _armar_escenario(db_conn)
    repo.cerrar_periodo(db_conn, PERIODO, usuario="test")
    snapshot = repo.snapshot_de_cierre(db_conn, PERIODO)
    asiento = repo.asiento_provision(snapshot)
    assert len(asiento) == 1
    assert asiento[0]["proveedor"] == "Crudos del Norte SRL"
    assert asiento[0]["importe"] == 5000.0
    assert asiento[0]["moneda"] == "USD"


def test_precio_final_despues_del_cierre_genera_ajuste_en_el_mes_corriente(db_conn):
    entrega_id = _armar_escenario(db_conn)
    repo.cerrar_periodo(db_conn, PERIODO, usuario="test")

    db.insertar(db_conn, "precios", dict(
        periodo=PERIODO, producto="Escalante", proveedor="Crudos del Norte SRL", precio=63.0,
        moneda="USD", tipo="final", fuente="test", fecha_carga="2026-07-01T00:00:00",
    ))
    creados = repo.generar_ajustes_posteriores_si_corresponde(
        db_conn, PERIODO, "Escalante", "Crudos del Norte SRL", usuario="test"
    )
    assert creados == 1

    ajustes = repo.listar_ajustes_posteriores(db_conn)
    assert len(ajustes) == 1
    assert ajustes[0]["entrega_id"] == entrega_id
    assert ajustes[0]["periodo_original"] == PERIODO
    assert ajustes[0]["periodo_ajuste"] == repo.mes_actual()
    # antes (estimado 60): valor teórico 60000. ahora (final 63): 63000 -> ajuste de +3000
    assert ajustes[0]["delta_ajuste"] == 3000.0

    # el período cerrado no se tocó: la entrega sigue Cerrada
    entrega = db.obtener_por_id(db_conn, "entregas", entrega_id)
    assert entrega["estado"] == "Cerrada"


def test_sin_cierre_previo_no_genera_ajustes_posteriores(db_conn):
    _armar_escenario(db_conn)  # período abierto, nunca se cerró
    creados = repo.generar_ajustes_posteriores_si_corresponde(
        db_conn, PERIODO, "Escalante", "Crudos del Norte SRL", usuario="test"
    )
    assert creados == 0
