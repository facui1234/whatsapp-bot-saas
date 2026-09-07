"""Motor de conciliación de compras de crudo.

Este módulo es puro: no importa Streamlit ni sqlite3, sólo trabaja con
`dataclasses` y listas de diccionarios. Así se puede testear con
`pytest` sin necesitar la base de datos ni la interfaz.

Fórmula general por entrega
----------------------------
    precio_aplicable = precio FINAL del período/producto/proveedor si existe,
                        si no, el ESTIMADO más reciente.
    valor_teorico    = volumen_contractual x precio_aplicable

    neto_documentado = suma(FACTURA) + suma(ND) - suma(NC), imputado a la
                        entrega, SIEMPRE neto sin IVA.

    delta_total = valor_teorico - neto_documentado (convertido a la moneda
                  del precio usando el tipo de cambio REAL de cada documento)

    delta_total  > tolerancia  -> falta una NOTA DE DÉBITO
    delta_total  < -tolerancia -> falta una NOTA DE CRÉDITO
    |delta_total| <= tolerancia-> conciliada

Ajustes por volumen (medición final, mermas, %BSW)
----------------------------------------------------
El volumen de la entrega puede corregirse con documentos: al cargar una ND
o NC por volumen, se informa `volumen_imputado` con signo (positivo si el
volumen final es MAYOR al del remito, negativo si es MENOR). El
`valor_teorico` se calcula siempre sobre el volumen ya corregido por esos
documentos (si no hay ninguno, es el volumen contractual de la entrega).
Así, una vez que llega la ND/NC de volumen, el delta se cierra solo.

Descomposición del delta
-------------------------
Se piden "los dos deltas aparte": por precio y por tipo de cambio. Suman
exactamente el total:

    delta_total = delta_precio + delta_tipo_cambio

- delta_tipo_cambio: efecto de que el proveedor haya facturado en otra
  moneda a un tipo de cambio distinto al tipo de cambio de referencia del
  período (cargado en la pantalla de Precios).
- delta_precio: lo que queda después de sacar el tipo de cambio; es la
  diferencia atribuible al precio unitario en sí (ya con el volumen
  corregido, si correspondía).

Además se informa `delta_volumen`, un dato de auditoría: cuánto se movió
el valor teórico por la revisión de volumen frente al volumen contractual
original de la entrega (no forma parte de la suma de arriba: una vez
documentado, el ajuste de volumen ya está reflejado en `valor_teorico`).
"""
from __future__ import annotations

from dataclasses import dataclass, field

TOLERANCIA_DEFAULT = 500.0

ESTADO_CONCILIADA = "conciliada"
ESTADO_FALTA_ND = "falta_nd"
ESTADO_FALTA_NC = "falta_nc"
ESTADO_SIN_PRECIO = "sin_precio"

TIPOS_DOCUMENTO_POSITIVOS = {"FACTURA", "ND"}
TIPOS_DOCUMENTO_NEGATIVOS = {"NC"}


@dataclass
class Entrega:
    id: int
    proveedor: str
    producto: str
    periodo_contable: str
    volumen: float


@dataclass
class Precio:
    periodo: str
    producto: str
    proveedor: str
    precio: float
    moneda: str
    tipo: str  # "estimado" | "final"
    fecha_carga: str


@dataclass
class DocumentoImputado:
    """Un documento (o la porción imputada de él) aplicado a una entrega."""

    tipo: str  # FACTURA | ND | NC
    moneda: str
    monto_imputado: float  # neto sin IVA, en `moneda`, siempre positivo
    volumen_imputado: float | None = None
    tipo_cambio: float | None = None  # tasa aplicada por el proveedor (moneda por USD)


@dataclass
class ResultadoConciliacion:
    entrega_id: int
    precio_aplicable: float | None
    moneda_precio: str | None
    tipo_precio_usado: str | None  # "estimado" | "final" | None
    volumen_contractual: float
    volumen_documentado: float
    valor_teorico: float | None
    neto_documentado_moneda_precio: float
    delta_total: float | None
    delta_precio: float | None
    delta_volumen: float | None
    delta_tipo_cambio: float | None
    tolerancia_aplicada: float
    estado: str
    advertencias: list[str] = field(default_factory=list)

    @property
    def monto_faltante(self) -> float | None:
        if self.delta_total is None:
            return None
        return abs(self.delta_total)

    @property
    def documento_faltante(self) -> str | None:
        if self.estado == ESTADO_FALTA_ND:
            return "ND"
        if self.estado == ESTADO_FALTA_NC:
            return "NC"
        return None


def seleccionar_precio_aplicable(
    precios: list[Precio], periodo: str, producto: str, proveedor: str
) -> Precio | None:
    """Devuelve el precio FINAL más reciente; si no hay, el ESTIMADO más reciente."""
    candidatos = [
        p
        for p in precios
        if p.periodo == periodo and p.producto == producto and p.proveedor == proveedor
    ]
    if not candidatos:
        return None

    finales = [p for p in candidatos if p.tipo == "final"]
    if finales:
        return max(finales, key=lambda p: p.fecha_carga)

    estimados = [p for p in candidatos if p.tipo == "estimado"]
    if estimados:
        return max(estimados, key=lambda p: p.fecha_carga)

    return None


def determinar_tolerancia(
    proveedor: str,
    tolerancia_global: float = TOLERANCIA_DEFAULT,
    tolerancias_por_proveedor: dict[str, float] | None = None,
) -> float:
    tolerancias_por_proveedor = tolerancias_por_proveedor or {}
    return tolerancias_por_proveedor.get(proveedor, tolerancia_global)


def _neto_en_moneda_precio(
    doc: DocumentoImputado, moneda_precio: str, tasa_referencia: float | None
) -> tuple[float, float]:
    """Devuelve (neto_a_tasa_real, neto_a_tasa_referencia) en `moneda_precio`.

    Si el documento ya está en la moneda del precio, ambos valores son
    iguales al monto imputado (no hay conversión que hacer).
    """
    signo = 1 if doc.tipo in TIPOS_DOCUMENTO_POSITIVOS else -1
    monto = signo * doc.monto_imputado

    if doc.moneda == moneda_precio:
        return monto, monto

    # El documento está en otra moneda (típicamente ARS, precio en USD).
    tasa_real = doc.tipo_cambio
    neto_real = monto / tasa_real if tasa_real else monto
    neto_ref = monto / tasa_referencia if tasa_referencia else neto_real
    return neto_real, neto_ref


def calcular_conciliacion_entrega(
    entrega: Entrega,
    precios: list[Precio],
    documentos: list[DocumentoImputado],
    tolerancia_global: float = TOLERANCIA_DEFAULT,
    tolerancias_por_proveedor: dict[str, float] | None = None,
    tasa_cambio_referencia: float | None = None,
) -> ResultadoConciliacion:
    advertencias: list[str] = []
    tolerancia = determinar_tolerancia(
        entrega.proveedor, tolerancia_global, tolerancias_por_proveedor
    )

    precio = seleccionar_precio_aplicable(
        precios, entrega.periodo_contable, entrega.producto, entrega.proveedor
    )

    volumen_documentado = entrega.volumen
    volumenes_doc = [d.volumen_imputado for d in documentos if d.volumen_imputado is not None]
    if volumenes_doc:
        volumen_documentado = sum(volumenes_doc)

    if precio is None:
        advertencias.append(
            f"No hay precio cargado para {entrega.producto} / {entrega.proveedor} "
            f"en el período {entrega.periodo_contable}."
        )
        # Igual calculamos lo documentado, para poder mostrarlo en pantalla.
        moneda_ref = documentos[0].moneda if documentos else "USD"
        neto_doc = sum(
            _neto_en_moneda_precio(d, moneda_ref, tasa_cambio_referencia)[0] for d in documentos
        )
        return ResultadoConciliacion(
            entrega_id=entrega.id,
            precio_aplicable=None,
            moneda_precio=None,
            tipo_precio_usado=None,
            volumen_contractual=entrega.volumen,
            volumen_documentado=volumen_documentado,
            valor_teorico=None,
            neto_documentado_moneda_precio=neto_doc,
            delta_total=None,
            delta_precio=None,
            delta_volumen=None,
            delta_tipo_cambio=None,
            tolerancia_aplicada=tolerancia,
            estado=ESTADO_SIN_PRECIO,
            advertencias=advertencias,
        )

    moneda_precio = precio.moneda
    # El valor teórico "de verdad" se calcula sobre el volumen ya corregido
    # por ND/NC de volumen (medición final, mermas, %BSW) cuando existen;
    # si todavía no se documentó ningún ajuste de volumen, coincide con el
    # volumen contractual de la entrega.
    valor_teorico = volumen_documentado * precio.precio
    valor_teorico_contractual = entrega.volumen * precio.precio

    monedas_distintas = {d.moneda for d in documentos if d.moneda != moneda_precio}
    if monedas_distintas and tasa_cambio_referencia is None:
        advertencias.append(
            "Hay documentos en una moneda distinta a la del precio y no hay "
            "tipo de cambio de referencia cargado para el período: el delta "
            "de tipo de cambio no se pudo calcular con precisión."
        )
    for d in documentos:
        if d.moneda != moneda_precio and d.tipo_cambio is None:
            advertencias.append(
                f"El documento en {d.moneda} no tiene tipo de cambio informado; "
                "se usó el de referencia para convertirlo."
            )

    netos_reales = []
    netos_referencia = []
    for d in documentos:
        neto_real, neto_ref = _neto_en_moneda_precio(d, moneda_precio, tasa_cambio_referencia)
        netos_reales.append(neto_real)
        netos_referencia.append(neto_ref)

    neto_documentado_real = sum(netos_reales)
    neto_documentado_ref = sum(netos_referencia)

    # delta_precio + delta_tipo_cambio = delta_total (los "dos deltas
    # aparte" pedidos). delta_volumen es un dato informativo extra: cuánto
    # se movió el valor teórico por la revisión de volumen respecto del
    # volumen contractual original (no se sigue sumando aparte porque una
    # vez documentado el ajuste de volumen, ya queda reflejado en
    # `valor_teorico` y por lo tanto en el propio delta_total).
    delta_total = valor_teorico - neto_documentado_real
    delta_tipo_cambio = neto_documentado_ref - neto_documentado_real
    delta_precio = valor_teorico - neto_documentado_ref
    delta_volumen = valor_teorico - valor_teorico_contractual

    if abs(delta_total) <= tolerancia:
        estado = ESTADO_CONCILIADA
    elif delta_total > tolerancia:
        estado = ESTADO_FALTA_ND
    else:
        estado = ESTADO_FALTA_NC

    return ResultadoConciliacion(
        entrega_id=entrega.id,
        precio_aplicable=precio.precio,
        moneda_precio=moneda_precio,
        tipo_precio_usado=precio.tipo,
        volumen_contractual=entrega.volumen,
        volumen_documentado=volumen_documentado,
        valor_teorico=valor_teorico,
        neto_documentado_moneda_precio=neto_documentado_real,
        delta_total=delta_total,
        delta_precio=delta_precio,
        delta_volumen=delta_volumen,
        delta_tipo_cambio=delta_tipo_cambio,
        tolerancia_aplicada=tolerancia,
        estado=estado,
        advertencias=advertencias,
    )


def estado_ciclo_de_vida(resultado: ResultadoConciliacion, tiene_documentos: bool) -> str:
    """Deriva el estado de negocio de la entrega (para la columna `estado`).

    Recibida sin facturar -> Facturada a precio provisorio -> Ajuste pendiente -> Cerrada
    (el estado "Cerrada" lo fija exclusivamente el cierre de período, no esta función).
    """
    if not tiene_documentos:
        return "Recibida sin facturar"
    if resultado.estado == ESTADO_CONCILIADA:
        return "Facturada a precio provisorio"
    return "Ajuste pendiente"
