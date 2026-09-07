"""Plantillas Excel, carga masiva desde Excel y desde CSV de SAP
(FBL1N / MB51) con mapeo de columnas guardable."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import bootstrap, db, importers as imp, templates

st.set_page_config(page_title="Importar", page_icon="📥", layout="wide")
bootstrap.asegurar_base()
st.title("📥 Importar")

ENTIDADES = {
    "Entregas": dict(preparar=imp.validar_y_preparar_entregas, importar=imp.importar_entregas,
                      campos=imp.CAMPOS_ENTREGAS, plantilla=templates.plantilla_entregas),
    "Precios": dict(preparar=imp.validar_y_preparar_precios, importar=imp.importar_precios,
                     campos=imp.CAMPOS_PRECIOS, plantilla=templates.plantilla_precios),
    "Documentos": dict(preparar=imp.validar_y_preparar_documentos, importar=imp.importar_documentos,
                        campos=imp.CAMPOS_DOCUMENTOS, plantilla=templates.plantilla_documentos),
}

tab_plantillas, tab_excel, tab_sap = st.tabs(["📎 Plantillas", "📤 Subir Excel", "🏭 Importar desde SAP"])

# -- Plantillas ---------------------------------------------------------------
with tab_plantillas:
    st.markdown("Descargá la plantilla, completala con tus datos (mirá las 5 filas de ejemplo) y subila en la pestaña **Subir Excel**.")
    c1, c2, c3 = st.columns(3)
    c1.download_button("📥 Plantilla de Entregas", data=templates.plantilla_entregas(),
                        file_name="plantilla_entregas.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    c2.download_button("📥 Plantilla de Precios", data=templates.plantilla_precios(),
                        file_name="plantilla_precios.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    c3.download_button("📥 Plantilla de Documentos", data=templates.plantilla_documentos(),
                        file_name="plantilla_documentos.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# -- Subir Excel ----------------------------------------------------------------
with tab_excel:
    entidad = st.selectbox("¿Qué querés importar?", list(ENTIDADES.keys()), key="entidad_excel")
    archivo = st.file_uploader("Subí el Excel completado", type=["xlsx"], key="uploader_excel")

    if archivo is not None:
        df = imp.leer_excel(archivo)
        st.markdown(f"**Vista previa** ({len(df)} filas):")
        st.dataframe(df, width="stretch", hide_index=True)

        errores, filas_listas = ENTIDADES[entidad]["preparar"](df)

        if errores:
            st.error(f"Encontré {len(errores)} error(es). No se guardó nada todavía.")
            st.dataframe(pd.DataFrame(errores).rename(columns={
                "fila": "Fila", "columna": "Columna", "mensaje": "Qué está mal",
            }), width="stretch", hide_index=True)
        else:
            st.success(f"Todo validado: {len(filas_listas)} fila(s) listas para importar.")
            if st.button(f"Confirmar importación de {entidad}", type="primary"):
                with db.conectar() as conn:
                    cantidad = ENTIDADES[entidad]["importar"](conn, filas_listas, db.USUARIO_POR_DEFECTO)
                st.success(f"Se importaron {cantidad} fila(s) de {entidad}.")
                st.rerun()

# -- Importar desde SAP -----------------------------------------------------------
with tab_sap:
    st.markdown(
        "Los documentos de SAP se exportan a CSV desde **FBL1N** (facturas/ND/NC de "
        "proveedor) o **MB51** (movimientos de mercadería, para Entregas). "
        "Mapeá una vez las columnas del CSV a los campos del sistema; la próxima "
        "vez que subas un CSV de la misma transacción, el mapeo se recuerda solo."
    )
    with db.conectar() as conn:
        mapeos_guardados = imp.listar_mapeos_sap(conn)

        c1, c2 = st.columns(2)
        entidad_sap = c1.selectbox("Destino", list(ENTIDADES.keys()), key="entidad_sap")
        nombre_mapeo = c2.text_input(
            "Nombre del mapeo (p.ej. FBL1N o MB51)",
            value=mapeos_guardados[0] if mapeos_guardados else "FBL1N",
        )

        archivo_csv = st.file_uploader("Subí el CSV exportado de SAP", type=["csv", "txt"], key="uploader_sap")

        if archivo_csv is not None:
            df_csv = imp.leer_csv(archivo_csv)
            st.markdown(f"**Columnas encontradas en el CSV** ({len(df_csv)} filas):")
            st.dataframe(df_csv.head(10), width="stretch", hide_index=True)

            campos_sistema = ENTIDADES[entidad_sap]["campos"]
            mapeo_guardado = imp.obtener_mapeo_sap(conn, nombre_mapeo) or {}
            columnas_csv = ["(no mapear)"] + list(df_csv.columns)

            st.markdown("**Mapeo de columnas**")
            mapeo_actual = {}
            cols = st.columns(3)
            for i, campo in enumerate(campos_sistema):
                valor_guardado = mapeo_guardado.get(campo)
                index = columnas_csv.index(valor_guardado) if valor_guardado in columnas_csv else 0
                seleccion = cols[i % 3].selectbox(campo, columnas_csv, index=index, key=f"map_{campo}")
                if seleccion != "(no mapear)":
                    mapeo_actual[campo] = seleccion

            if st.button("Guardar este mapeo para la próxima vez"):
                imp.guardar_mapeo_sap(conn, nombre_mapeo, mapeo_actual)
                st.success(f"Mapeo '{nombre_mapeo}' guardado.")

            df_mapeado = imp.aplicar_mapeo_columnas(df_csv, mapeo_actual, campos_sistema)
            st.markdown("**Vista previa ya mapeada a los campos del sistema:**")
            st.dataframe(df_mapeado, width="stretch", hide_index=True)

            errores, filas_listas = ENTIDADES[entidad_sap]["preparar"](df_mapeado)
            if errores:
                st.error(f"Encontré {len(errores)} error(es) después de mapear. No se guardó nada todavía.")
                st.dataframe(pd.DataFrame(errores).rename(columns={
                    "fila": "Fila", "columna": "Columna", "mensaje": "Qué está mal",
                }), width="stretch", hide_index=True)
            else:
                st.success(f"Todo validado: {len(filas_listas)} fila(s) listas para importar.")
                if st.button(f"Confirmar importación desde SAP a {entidad_sap}", type="primary"):
                    if entidad_sap == "Documentos":
                        cantidad = imp.importar_documentos(conn, filas_listas, db.USUARIO_POR_DEFECTO, origen="sap")
                    else:
                        cantidad = ENTIDADES[entidad_sap]["importar"](conn, filas_listas, db.USUARIO_POR_DEFECTO)
                    st.success(f"Se importaron {cantidad} fila(s) desde SAP.")
                    st.rerun()

        mapeos_guardados = imp.listar_mapeos_sap(conn)
        if mapeos_guardados:
            st.caption(f"Mapeos guardados: {', '.join(mapeos_guardados)}")
