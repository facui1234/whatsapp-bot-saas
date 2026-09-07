"""Tests del matcheo automático documento <-> entrega (core/matching.py)."""
from __future__ import annotations

from core.matching import (
    DocumentoAMatchear,
    EntregaCandidata,
    METODO_APROXIMADO,
    METODO_EXACTO,
    emparejar_documento,
)

PROVEEDOR = "PetroSur SA"


def entrega(id_, remito=None, oc=None, volumen=1000, periodo="2026-06"):
    return EntregaCandidata(id=id_, proveedor=PROVEEDOR, periodo_contable=periodo,
                             contrato_oc=oc, remito=remito, volumen=volumen)


def documento(referencia=None, volumen_facturado=None, periodo="2026-06"):
    return DocumentoAMatchear(id=1, proveedor=PROVEEDOR, periodo_contable=periodo,
                               referencia=referencia, volumen_facturado=volumen_facturado)


def test_match_exacto_por_remito_se_imputa_solo():
    entregas = [entrega(1, remito="R-100")]
    doc = documento(referencia="R-100")
    resultado = emparejar_documento(doc, entregas)
    assert resultado.match_automatico is not None
    assert resultado.match_automatico.entrega_id == 1
    assert resultado.match_automatico.metodo == METODO_EXACTO
    assert resultado.match_automatico.confianza == 1.0


def test_match_exacto_por_oc():
    entregas = [entrega(1, oc="OC-999")]
    doc = documento(referencia="OC-999")
    resultado = emparejar_documento(doc, entregas)
    assert resultado.match_automatico.entrega_id == 1


def test_documento_sin_entrega_queda_sin_sugerencias():
    entregas = [entrega(1, remito="R-100")]
    doc = documento(referencia="R-DESCONOCIDO", volumen_facturado=None)
    resultado = emparejar_documento(doc, entregas)
    assert resultado.match_automatico is None
    assert resultado.sugerencias == []


def test_referencia_ambigua_entre_varias_entregas_no_se_autoimputa():
    entregas = [entrega(1, oc="OC-1"), entrega(2, oc="OC-1")]
    doc = documento(referencia="OC-1")
    resultado = emparejar_documento(doc, entregas)
    assert resultado.match_automatico is None
    assert len(resultado.sugerencias) == 2
    assert all(s.metodo == METODO_EXACTO for s in resultado.sugerencias)


def test_match_aproximado_por_volumen_no_se_autoimputa_pero_se_sugiere():
    entregas = [entrega(1, remito="OTRO-REMITO", volumen=1000)]
    doc = documento(referencia=None, volumen_facturado=1020)  # 2% de diferencia
    resultado = emparejar_documento(doc, entregas, tolerancia_volumen_pct=0.05)
    assert resultado.match_automatico is None
    assert len(resultado.sugerencias) == 1
    assert resultado.sugerencias[0].metodo == METODO_APROXIMADO
    assert 0 < resultado.sugerencias[0].confianza < 1.0


def test_match_aproximado_fuera_de_tolerancia_no_sugiere():
    entregas = [entrega(1, remito="OTRO-REMITO", volumen=1000)]
    doc = documento(referencia=None, volumen_facturado=1200)  # 20% de diferencia
    resultado = emparejar_documento(doc, entregas, tolerancia_volumen_pct=0.05)
    assert resultado.sugerencias == []


def test_proveedor_distinto_nunca_matchea():
    entregas = [EntregaCandidata(id=1, proveedor="Otro Proveedor", periodo_contable="2026-06",
                                  contrato_oc=None, remito="R-100", volumen=1000)]
    doc = documento(referencia="R-100")
    resultado = emparejar_documento(doc, entregas)
    assert resultado.match_automatico is None
    assert resultado.sugerencias == []
