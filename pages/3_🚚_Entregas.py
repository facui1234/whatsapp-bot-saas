"""Listado de entregas, alta/edición manual y detalle del cálculo del delta."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import bootstrap, db, repository as repo

st.set_page_config(page_title="Entregas", page_icon="🚚", layout="wide")
bootstrap.asegurar_base()
bootstrap.mostrar_barra_lateral()
st.title("🚚 Entregas")

ESTADOS = [
    "Recibida sin facturar",
    "Facturada a precio provisorio",
    "Ajuste pendiente",
    "Cerrada",
]

with db.conectar() as conn:
    proveedores = bootstrap.valores_distintos(conn, "entregas", "proveedor") or bootstrap.PROVEEDORES_EJEMPLO
    productos = bootstrap.valores_distintos(conn, "entregas", "producto") or bootstrap.PRODUCTOS_EJEMPLO

    tab_listado, tab_alta = st.tabs(["Listado y detalle", "Cargar / editar a mano"])

    with tab_listado:
        col1, col2, col3 = st.columns(3)
        f_proveedor = col1.multiselect("Proveedor", proveedores)
        f_periodo = col2.text_input("Período (AAAA-MM)", value="")
        f_estado = col3.multiselect("Estado", ESTADOS)

        entregas = db.listar(conn, "entregas", orden="periodo_contable DESC, id DESC")
        if f_proveedor:
            entregas = [e for e in entregas if e["proveedor"] in f_proveedor]
        if f_periodo:
            entregas = [e for e in entregas if e["periodo_contable"] == f_periodo]
        if f_estado:
            entregas = [e for e in entregas if e["estado"] in f_estado]

        df = pd.DataFrame(db.filas_a_dicts(entregas))
        st.dataframe(df, width='stretch', hide_index=True)

        if entregas:
            st.subheader("Detalle del cálculo del delta")
            ids = [e["id"] for e in entregas]
            entrega_id = st.selectbox("Elegí una entrega", ids)
            entrega = db.obtener_por_id(conn, "entregas", entrega_id)
            resultado = repo.calcular_resultado_entrega(conn, entrega)

            c1, c2, c3 = st.columns(3)
            c1.metric("Precio aplicable", f"{resultado.precio_aplicable} {resultado.moneda_precio or ''}"
                      if resultado.precio_aplicable else "Sin precio cargado")
            c1.caption(f"Tipo: {resultado.tipo_precio_usado or '-'}")
            c2.metric("Valor teórico", f"{resultado.valor_teorico:,.2f}" if resultado.valor_teorico is not None else "-")
            c3.metric("Neto documentado", f"{resultado.neto_documentado_moneda_precio:,.2f}")

            c4, c5, c6, c7 = st.columns(4)
            c4.metric("Delta total", f"{resultado.delta_total:,.2f}" if resultado.delta_total is not None else "-")
            c5.metric("· por precio", f"{resultado.delta_precio:,.2f}" if resultado.delta_precio is not None else "-")
            c6.metric("· por volumen", f"{resultado.delta_volumen:,.2f}" if resultado.delta_volumen is not None else "-")
            c7.metric("· por tipo de cambio", f"{resultado.delta_tipo_cambio:,.2f}" if resultado.delta_tipo_cambio is not None else "-")

            estado_legible = {
                "conciliada": "✅ Conciliada",
                "falta_nd": "🔴 Falta Nota de Débito",
                "falta_nc": "🔵 Falta Nota de Crédito",
                "sin_precio": "⚪ Sin precio cargado",
            }[resultado.estado]
            st.markdown(f"**Estado de conciliación:** {estado_legible} (tolerancia aplicada: {resultado.tolerancia_aplicada})")
            for adv in resultado.advertencias:
                st.warning(adv)

            docs = repo.documentos_imputados_de_entrega(conn, entrega_id)
            st.markdown("**Documentos imputados a esta entrega:**")
            if docs:
                st.dataframe(pd.DataFrame(docs), width='stretch', hide_index=True)
            else:
                st.caption("Todavía no tiene documentos imputados.")

    with tab_alta:
        st.markdown("Completá el formulario para cargar una entrega nueva o editar una existente.")
        modo = st.radio("¿Qué querés hacer?", ["Cargar nueva", "Editar existente"], horizontal=True)

        entrega_existente = None
        if modo == "Editar existente":
            todas = db.listar(conn, "entregas")
            if not todas:
                st.info("No hay entregas cargadas todavía.")
                st.stop()
            opciones = {f"#{e['id']} - {e['proveedor']} - {e['remito'] or ''}": e["id"] for e in todas}
            elegido = st.selectbox("Entrega a editar", list(opciones.keys()))
            entrega_existente = db.obtener_por_id(conn, "entregas", opciones[elegido])
            if entrega_existente["estado"] == "Cerrada":
                st.error(
                    "Esta entrega pertenece a un período CERRADO y no se puede modificar. "
                    "Si el precio pasó de estimado a final, cargalo en Precios: el sistema "
                    "genera el ajuste como movimiento del mes corriente."
                )
                st.stop()

        def valor(campo, default=""):
            return entrega_existente[campo] if entrega_existente else default

        with st.form("form_entrega"):
            c1, c2 = st.columns(2)
            fecha = c1.text_input("Fecha (AAAA-MM-DD)", value=valor("fecha"))
            proveedor = c2.text_input("Proveedor", value=valor("proveedor"))

            c3, c4 = st.columns(2)
            contrato_oc = c3.text_input("Contrato / OC", value=valor("contrato_oc"))
            remito = c4.text_input("Remito", value=valor("remito"))

            c5, c6, c7 = st.columns(3)
            producto = c5.text_input("Producto (calidad de crudo)", value=valor("producto"))
            volumen = c6.number_input("Volumen", min_value=0.0, value=float(valor("volumen", 0.0)))
            unidad = c7.selectbox("Unidad", bootstrap.UNIDADES_VOLUMEN,
                                   index=bootstrap.UNIDADES_VOLUMEN.index(valor("unidad_volumen", "m3")))

            c8, c9, c10 = st.columns(3)
            punto_entrega = c8.text_input("Punto de entrega", value=valor("punto_entrega"))
            periodo_contable = c9.text_input("Período contable (AAAA-MM)", value=valor("periodo_contable"))
            estado = c10.selectbox("Estado", ESTADOS, index=ESTADOS.index(valor("estado", ESTADOS[0])))

            enviado = st.form_submit_button("Guardar")

        if enviado:
            errores = []
            if not fecha:
                errores.append("Falta la fecha.")
            if not proveedor:
                errores.append("Falta el proveedor.")
            if not producto:
                errores.append("Falta el producto.")
            if volumen <= 0:
                errores.append("El volumen tiene que ser mayor a cero.")
            if not periodo_contable:
                errores.append("Falta el período contable.")

            if errores:
                for e in errores:
                    st.error(e)
            else:
                datos = dict(
                    fecha=fecha, proveedor=proveedor, contrato_oc=contrato_oc or None,
                    remito=remito or None, producto=producto, volumen=volumen,
                    unidad_volumen=unidad, punto_entrega=punto_entrega or None,
                    periodo_contable=periodo_contable, estado=estado,
                )
                if entrega_existente:
                    datos["modificado_por"] = db.USUARIO_POR_DEFECTO
                    datos["modificado_en"] = db.ahora()
                    db.actualizar(conn, "entregas", entrega_existente["id"], datos)
                    st.success(f"Entrega #{entrega_existente['id']} actualizada.")
                else:
                    datos["creado_por"] = db.USUARIO_POR_DEFECTO
                    datos["creado_en"] = db.ahora()
                    nuevo_id = db.insertar(conn, "entregas", datos)
                    st.success(f"Entrega #{nuevo_id} cargada.")
                st.rerun()
