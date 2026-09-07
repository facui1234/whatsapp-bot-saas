"""La pantalla más importante: qué documento falta recibir de cada
proveedor y por cuánto. Filtrable y exportable a Excel para el reclamo."""
from __future__ import annotations

import io

import pandas as pd
import streamlit as st

from core import bootstrap, db, repository as repo

st.set_page_config(page_title="Faltantes", page_icon="🚨", layout="wide")
bootstrap.asegurar_base()
st.title("🚨 Faltantes de documentación")
st.caption("Entregas cuyo delta está fuera de la tolerancia: esto es lo que falta reclamarle al proveedor.")

with db.conectar() as conn:
    periodos = repo.periodos_disponibles(conn)
    proveedores = bootstrap.valores_distintos(conn, "entregas", "proveedor")

    c1, c2, c3 = st.columns(3)
    f_periodo = c1.selectbox("Período", ["(todos)"] + periodos)
    f_proveedor = c2.multiselect("Proveedor", proveedores)
    f_tipo = c3.multiselect("Documento esperado", ["ND", "NC"])

    periodo_query = None if f_periodo == "(todos)" else f_periodo
    faltantes = repo.tabla_faltantes(conn, periodo=periodo_query)

    if f_proveedor:
        faltantes = [f for f in faltantes if f["proveedor"] in f_proveedor]
    if f_tipo:
        faltantes = [f for f in faltantes if f["documento_esperado"] in f_tipo]

    if not faltantes:
        st.success("No hay faltantes con los filtros elegidos. 🎉")
    else:
        df = pd.DataFrame(faltantes).rename(columns={
            "entrega_id": "Entrega", "proveedor": "Proveedor", "producto": "Producto",
            "periodo_contable": "Período", "fecha_entrega": "Fecha entrega",
            "remito": "Remito", "contrato_oc": "OC", "documento_esperado": "Documento esperado",
            "monto": "Monto", "moneda": "Moneda", "antiguedad_dias": "Antigüedad (días)",
        })
        st.dataframe(df, width='stretch', hide_index=True)

        total_nd = sum(f["monto"] or 0 for f in faltantes if f["documento_esperado"] == "ND")
        total_nc = sum(f["monto"] or 0 for f in faltantes if f["documento_esperado"] == "NC")
        c1, c2, c3 = st.columns(3)
        c1.metric("Cantidad de faltantes", len(faltantes))
        c2.metric("Total falta ND", f"{total_nd:,.0f}")
        c3.metric("Total falta NC", f"{total_nc:,.0f}")

        buffer = io.BytesIO()
        df.to_excel(buffer, index=False, sheet_name="Faltantes")
        st.download_button(
            "📥 Exportar a Excel",
            data=buffer.getvalue(),
            file_name=f"faltantes_{f_periodo if f_periodo != '(todos)' else 'todos'}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
