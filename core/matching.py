"""Matcheo automático documento <-> entrega.

Reglas (en este orden):

1. Exacto: proveedor igual + `referencia` del documento coincide con el
   remito o el contrato/OC de la entrega. Si hay una única entrega
   candidata, se imputa automáticamente con confianza 1.0.
2. Aproximado: proveedor + período contable + volumen facturado dentro de
   una tolerancia porcentual respecto del volumen de la entrega. NUNCA se
   imputa solo: queda como sugerencia en la bandeja de pendientes.
3. Lo que no matchea (o matchea ambiguo) va a "Pendientes de imputar" con
   las mejores sugerencias ordenadas, para que el usuario elija a mano.

Este módulo es puro (no toca la base de datos) para poder testearlo con
listas de diccionarios / dataclasses directamente.
"""
from __future__ import annotations

from dataclasses import dataclass

TOLERANCIA_VOLUMEN_PORCENTUAL_DEFAULT = 0.05  # 5%

METODO_EXACTO = "exacto"
METODO_APROXIMADO = "aproximado"


@dataclass
class EntregaCandidata:
    id: int
    proveedor: str
    periodo_contable: str
    contrato_oc: str | None
    remito: str | None
    volumen: float
    ya_tiene_documento_exacto: bool = False


@dataclass
class DocumentoAMatchear:
    id: int
    proveedor: str
    periodo_contable: str | None
    referencia: str | None
    volumen_facturado: float | None


@dataclass
class Sugerencia:
    entrega_id: int
    metodo: str
    confianza: float


@dataclass
class ResultadoMatch:
    documento_id: int
    match_automatico: Sugerencia | None  # se puede imputar solo
    sugerencias: list[Sugerencia]  # para la bandeja de pendientes, ordenadas por confianza


def _candidatos_exactos(
    documento: DocumentoAMatchear, entregas: list[EntregaCandidata]
) -> list[EntregaCandidata]:
    if not documento.referencia:
        return []
    ref = documento.referencia.strip().lower()
    return [
        e
        for e in entregas
        if e.proveedor == documento.proveedor
        and (
            (e.remito and e.remito.strip().lower() == ref)
            or (e.contrato_oc and e.contrato_oc.strip().lower() == ref)
        )
    ]


def _candidatos_aproximados(
    documento: DocumentoAMatchear,
    entregas: list[EntregaCandidata],
    tolerancia_pct: float,
) -> list[Sugerencia]:
    if documento.volumen_facturado is None:
        return []
    sugerencias = []
    for e in entregas:
        if e.proveedor != documento.proveedor:
            continue
        if documento.periodo_contable and e.periodo_contable != documento.periodo_contable:
            continue
        if e.volumen == 0:
            continue
        diff_pct = abs(documento.volumen_facturado - e.volumen) / abs(e.volumen)
        if diff_pct <= tolerancia_pct:
            confianza = max(0.0, 1 - (diff_pct / tolerancia_pct)) * 0.79  # nunca llega a "exacto"
            sugerencias.append(Sugerencia(entrega_id=e.id, metodo=METODO_APROXIMADO, confianza=round(confianza, 2)))
    sugerencias.sort(key=lambda s: s.confianza, reverse=True)
    return sugerencias


def emparejar_documento(
    documento: DocumentoAMatchear,
    entregas: list[EntregaCandidata],
    tolerancia_volumen_pct: float = TOLERANCIA_VOLUMEN_PORCENTUAL_DEFAULT,
) -> ResultadoMatch:
    exactos = _candidatos_exactos(documento, entregas)

    if len(exactos) == 1:
        sugerencia = Sugerencia(entrega_id=exactos[0].id, metodo=METODO_EXACTO, confianza=1.0)
        return ResultadoMatch(
            documento_id=documento.id,
            match_automatico=sugerencia,
            sugerencias=[sugerencia],
        )

    sugerencias: list[Sugerencia] = []
    if len(exactos) > 1:
        # Ambiguo: varias entregas comparten OC/remito. No se auto-imputa.
        sugerencias.extend(
            Sugerencia(entrega_id=e.id, metodo=METODO_EXACTO, confianza=1.0) for e in exactos
        )
    else:
        sugerencias.extend(_candidatos_aproximados(documento, entregas, tolerancia_volumen_pct))

    return ResultadoMatch(documento_id=documento.id, match_automatico=None, sugerencias=sugerencias)


def emparejar_lote(
    documentos: list[DocumentoAMatchear],
    entregas: list[EntregaCandidata],
    tolerancia_volumen_pct: float = TOLERANCIA_VOLUMEN_PORCENTUAL_DEFAULT,
) -> list[ResultadoMatch]:
    return [emparejar_documento(d, entregas, tolerancia_volumen_pct) for d in documentos]
