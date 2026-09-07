"""Punto de entrada de la app. Arrancar con: streamlit run app.py

Esta pantalla es el Dashboard (pantalla 1 del pedido): totales del mes,
valuación a estimado vs final, monto pendiente de documentar y cantidad de
entregas por estado.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import bootstrap, db, repository as repo

st.set_page_config(page_title="Conciliación de Crudo", page_icon="🛢️", layout="wide")
bootstrap.asegurar_base()
bootstrap.mostrar_barra_lateral()

st.title("🛢️ Conciliación de compras de crudo")
st.caption(
    "Cuando el producto se entrega antes de que el precio esté cerrado, "
    "esta app te dice qué falta documentar y a qué valor cerrar cada compra."
)

with db.conectar() as conn:
    periodos = repo.periodos_disponibles(conn)
    if not periodos:
        st.info("Todavía no hay entregas cargadas. Andá a la página **Entregas** para cargar la primera.")
        st.stop()

    col_periodo, _ = st.columns([1, 3])
    periodo_sel = col_periodo.selectbox("Período contable", periodos, index=0)

    filas = repo.calcular_todas(conn, periodo=periodo_sel)

    total_teorico = sum(r.valor_teorico or 0 for _, r in filas)
    total_estimado = sum(r.valor_teorico or 0 for _, r in filas if r.tipo_precio_usado == "estimado")
    total_final = sum(r.valor_teorico or 0 for _, r in filas if r.tipo_precio_usado == "final")
    pendiente_documentar = sum(r.monto_faltante or 0 for _, r in filas if r.estado in (
        "falta_nd", "falta_nc"
    ))

    st.subheader(f"Resumen de {periodo_sel}")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total comprado (valor teórico)", f"USD {total_teorico:,.0f}")
    c2.metric("Valuado a precio ESTIMADO", f"USD {total_estimado:,.0f}")
    c3.metric("Valuado a precio FINAL", f"USD {total_final:,.0f}")
    c4.metric("Pendiente de documentar", f"USD {pendiente_documentar:,.0f}")

    st.subheader("Entregas por estado")
    estados = pd.Series([e["estado"] for e, _ in filas]).value_counts()
    st.bar_chart(estados)

    st.subheader("Detalle de conciliación por entrega")
    tabla = []
    for e, r in filas:
        tabla.append(dict(
            Entrega=e["id"], Proveedor=e["proveedor"], Producto=e["producto"],
            Volumen=e["volumen"], Estado=e["estado"],
            Precio=r.tipo_precio_usado, ValorTeorico=r.valor_teorico,
            Documentado=r.neto_documentado_moneda_precio, Delta=r.delta_total,
            Conciliacion=r.estado,
        ))
    df = pd.DataFrame(tabla)
    st.dataframe(df, width='stretch', hide_index=True)

st.divider()
st.markdown(
    "Usá el menú de la izquierda para: cargar **Entregas**, cargar la grilla de "
    "**Precios** del mes, subir **Documentos** y ver la pantalla de **Faltantes** "
    "(la que sirve para reclamarle al proveedor)."
)
