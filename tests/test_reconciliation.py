"""Tests del motor de conciliación (core/reconciliation.py).

Cubren los casos pedidos: falta ND, falta NC, conciliado dentro de
tolerancia, entrega sin documentos, documento sin entrega (no aplica acá,
se cubre en test_matching.py), precio estimado que pasa a final después de
cerrado el mes, y diferencia de cambio.
"""
from __future__ import annotations

from core.reconciliation import (
    DocumentoImputado,
    Entrega,
    ESTADO_CONCILIADA,
    ESTADO_FALTA_NC,
    ESTADO_FALTA_ND,
    ESTADO_SIN_PRECIO,
    Precio,
    calcular_conciliacion_entrega,
    determinar_tolerancia,
    seleccionar_precio_aplicable,
)

PRODUCTO = "Medanito"
PROVEEDOR = "PetroSur SA"
PERIODO = "2026-06"


def entrega(volumen=1000, periodo=PERIODO, proveedor=PROVEEDOR, producto=PRODUCTO):
    return Entrega(id=1, proveedor=proveedor, producto=producto, periodo_contable=periodo, volumen=volumen)


def precio(precio_valor, tipo, fecha_carga="2026-06-01T00:00:00", moneda="USD", periodo=PERIODO):
    return Precio(periodo=periodo, producto=PRODUCTO, proveedor=PROVEEDOR, precio=precio_valor,
                  moneda=moneda, tipo=tipo, fecha_carga=fecha_carga)


def factura(monto, moneda="USD", tipo_cambio=None, volumen=None):
    return DocumentoImputado(tipo="FACTURA", moneda=moneda, monto_imputado=monto,
                              volumen_imputado=volumen, tipo_cambio=tipo_cambio)


def nota_debito(monto, moneda="USD"):
    return DocumentoImputado(tipo="ND", moneda=moneda, monto_imputado=monto)


def nota_credito(monto, moneda="USD"):
    return DocumentoImputado(tipo="NC", moneda=moneda, monto_imputado=monto)


def test_conciliada_dentro_de_tolerancia():
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    docs = [factura(1000 * 60.0 - 10)]  # diferencia de 10, menor a la tolerancia
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=500)
    assert r.estado == ESTADO_CONCILIADA
    assert abs(r.delta_total) <= 500


def test_falta_nota_de_debito_cuando_el_precio_final_es_mayor_al_facturado():
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    docs = [factura(1000 * 55.0)]  # facturaron a un precio provisorio más bajo
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=100)
    assert r.estado == ESTADO_FALTA_ND
    assert r.delta_total == 5000.0
    assert r.documento_faltante == "ND"


def test_falta_nota_de_credito_cuando_facturaron_de_mas():
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    docs = [factura(1000 * 65.0)]  # facturaron a un precio mayor al final
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=100)
    assert r.estado == ESTADO_FALTA_NC
    assert r.delta_total == -5000.0
    assert r.documento_faltante == "NC"


def test_entrega_sin_documentos_queda_como_falta_nd_por_el_total():
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    r = calcular_conciliacion_entrega(e, precios, documentos=[], tolerancia_global=100)
    assert r.estado == ESTADO_FALTA_ND
    assert r.delta_total == 60000.0
    assert r.neto_documentado_moneda_precio == 0


def test_entrega_sin_precio_cargado():
    e = entrega(volumen=1000)
    r = calcular_conciliacion_entrega(e, precios=[], documentos=[factura(1000)], tolerancia_global=100)
    assert r.estado == ESTADO_SIN_PRECIO
    assert r.valor_teorico is None
    assert r.advertencias


def test_usa_precio_final_por_encima_del_estimado_cuando_ambos_existen():
    e = entrega(volumen=1000)
    precios = [
        precio(55.0, "estimado", fecha_carga="2026-06-01T00:00:00"),
        precio(60.0, "final", fecha_carga="2026-06-15T00:00:00"),
    ]
    docs = [factura(1000 * 60.0)]
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=100)
    assert r.precio_aplicable == 60.0
    assert r.tipo_precio_usado == "final"
    assert r.estado == ESTADO_CONCILIADA


def test_usa_estimado_mas_reciente_si_no_hay_final():
    e = entrega(volumen=1000)
    precios = [
        precio(55.0, "estimado", fecha_carga="2026-06-01T00:00:00"),
        precio(58.0, "estimado", fecha_carga="2026-06-10T00:00:00"),
    ]
    r = calcular_conciliacion_entrega(e, precios, documentos=[], tolerancia_global=100)
    assert r.precio_aplicable == 58.0
    assert r.tipo_precio_usado == "estimado"


def test_precio_estimado_pasa_a_final_despues_de_cerrado_recalcula_distinto():
    """Simula: en el período ya se calculó con el estimado (58); más tarde
    llega el precio final (61) y el recálculo debe dar un delta distinto,
    reflejando el ajuste que hay que llevar al mes corriente."""
    e = entrega(volumen=1000)
    docs = [factura(1000 * 58.0)]

    precios_en_el_cierre = [precio(58.0, "estimado", fecha_carga="2026-06-01T00:00:00")]
    resultado_en_el_cierre = calcular_conciliacion_entrega(e, precios_en_el_cierre, docs, tolerancia_global=100)
    assert resultado_en_el_cierre.tipo_precio_usado == "estimado"
    assert resultado_en_el_cierre.estado == ESTADO_CONCILIADA

    precios_despues = precios_en_el_cierre + [precio(61.0, "final", fecha_carga="2026-07-05T00:00:00")]
    resultado_recalculado = calcular_conciliacion_entrega(e, precios_despues, docs, tolerancia_global=100)
    assert resultado_recalculado.tipo_precio_usado == "final"
    assert resultado_recalculado.estado == ESTADO_FALTA_ND
    assert resultado_recalculado.delta_total == 3000.0
    assert resultado_recalculado.delta_total != resultado_en_el_cierre.delta_total


def test_diferencia_de_tipo_de_cambio_se_separa_de_la_de_precio():
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]  # USD
    # Factura en ARS: el proveedor facturó exactamente el valor teórico
    # convertido a SU tipo de cambio (1000), pero el de referencia del
    # período es distinto (900) -> no debería haber delta total, pero sí
    # un delta de tipo de cambio si se mirase con la tasa de referencia.
    valor_teorico_usd = 1000 * 60.0
    docs = [factura(valor_teorico_usd * 1000, moneda="ARS", tipo_cambio=1000)]
    r = calcular_conciliacion_entrega(
        e, precios, docs, tolerancia_global=1, tasa_cambio_referencia=900,
    )
    assert r.estado == ESTADO_CONCILIADA
    assert round(r.delta_total, 2) == 0.0
    assert r.delta_tipo_cambio != 0
    # los tres componentes siempre deben sumar el delta total
    assert round(r.delta_precio + r.delta_volumen + r.delta_tipo_cambio, 2) == round(r.delta_total, 2)


def test_ajuste_por_volumen_medicion_final_distinta_al_remito():
    """Remito: 1000 m3. Factura inicial a los 1000 m3. Medición final: 950 m3
    (mermas / %BSW) -> el proveedor manda una NC de volumen por los 50 m3 de
    más que facturó, con volumen_imputado en negativo (convención: negativo
    = reduce el volumen documentado). Una vez con esa NC cargada, la
    conciliación tiene que cerrar en cero (no queda un delta de precio)."""
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    docs = [
        factura(1000 * 60.0, volumen=1000),
        DocumentoImputado(tipo="NC", moneda="USD", monto_imputado=50 * 60.0, volumen_imputado=-50),
    ]
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=10)
    assert r.volumen_documentado == 950
    assert r.estado == ESTADO_CONCILIADA
    assert round(r.delta_precio, 2) == 0.0
    assert round(r.delta_volumen, 2) == round(-50 * 60.0, 2)  # dato informativo, no forma parte del delta_total


def test_sin_ajuste_de_volumen_documentado_se_concilia_al_volumen_nominal():
    """Sin ninguna ND/NC de volumen cargada todavía, el motor concilia contra
    el volumen nominal de la entrega (no puede adivinar una merma que nadie
    documentó): en cuanto llegue la NC de volumen, deja de estar conciliada
    hasta que también se cargue como imputación."""
    e = entrega(volumen=1000)
    precios = [precio(60.0, "final")]
    docs = [factura(1000 * 60.0, volumen=1000)]
    r = calcular_conciliacion_entrega(e, precios, docs, tolerancia_global=10)
    assert r.estado == ESTADO_CONCILIADA
    assert r.volumen_documentado == 1000


def test_tolerancia_por_proveedor_tiene_prioridad_sobre_la_global():
    e = entrega(volumen=1000, proveedor="Crudos del Norte SRL")
    tolerancia = determinar_tolerancia(
        "Crudos del Norte SRL", tolerancia_global=100, tolerancias_por_proveedor={"Crudos del Norte SRL": 5000}
    )
    assert tolerancia == 5000
    precios = [Precio(periodo=PERIODO, producto=PRODUCTO, proveedor="Crudos del Norte SRL", precio=60.0,
                       moneda="USD", tipo="final", fecha_carga="2026-06-01")]
    docs = [DocumentoImputado(tipo="FACTURA", moneda="USD", monto_imputado=1000 * 60.0 - 2000)]
    r = calcular_conciliacion_entrega(
        e, precios, docs, tolerancia_global=100,
        tolerancias_por_proveedor={"Crudos del Norte SRL": 5000},
    )
    assert r.estado == ESTADO_CONCILIADA


def test_seleccionar_precio_aplicable_sin_candidatos():
    assert seleccionar_precio_aplicable([], PERIODO, PRODUCTO, PROVEEDOR) is None
