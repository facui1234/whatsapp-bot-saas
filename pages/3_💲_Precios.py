"""Pantalla 'Precios del mes': grilla rápida para cargar precios y el
historial completo de versiones de cada precio (nunca se pisa un precio:
cada carga queda guardada como una fila nueva)."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import bootstrap, db, reconciliation as rec, repository as repo

st.set_page_config(page_title="Precios", page_icon="💲", layout="wide")
bootstrap.asegurar_base()
st.title("💲 Precios")

with db.conectar() as conn:
    periodos_entregas = repo.periodos_disponibles(conn)
    periodo = st.text_input(
        "Período a cargar (AAAA-MM)",
        value=periodos_entregas[0] if periodos_entregas else "",
    )

    tab_grilla, tab_form, tab_historial, tab_tc = st.tabs(
        ["Grilla rápida del mes", "Cargar un precio a mano", "Historial de versiones", "Tipo de cambio de referencia"]
    )

    # -- Grilla rápida --------------------------------------------------
    with tab_grilla:
        st.caption(
            "Se arma con los proveedores y productos que tienen entregas en el "
            "período elegido. Completá precio, moneda y si es estimado o final, "
            "y guardá todo junto."
        )
        combos = conn.execute(
            """SELECT DISTINCT proveedor, producto FROM entregas
               WHERE periodo_contable = ? ORDER BY proveedor, producto""",
            (periodo,),
        ).fetchall()

        if not combos:
            st.info("No hay entregas cargadas para ese período todavía.")
        else:
            precios_actuales = repo.precios_dataclasses(conn)
            filas_grilla = []
            for c in combos:
                vigente = rec.seleccionar_precio_aplicable(precios_actuales, periodo, c["producto"], c["proveedor"])
                filas_grilla.append(dict(
                    Proveedor=c["proveedor"],
                    Producto=c["producto"],
                    PrecioVigente=vigente.precio if vigente else None,
                    TipoVigente=vigente.tipo if vigente else "(sin cargar)",
                    NuevoPrecio=None,
                    Moneda="USD",
                    Tipo="estimado",
                    Fuente="",
                ))
            df_grilla = pd.DataFrame(filas_grilla)
            editado = st.data_editor(
                df_grilla,
                use_container_width=True,
                hide_index=True,
                disabled=["Proveedor", "Producto", "PrecioVigente", "TipoVigente"],
                column_config={
                    "Moneda": st.column_config.SelectboxColumn(options=bootstrap.MONEDAS),
                    "Tipo": st.column_config.SelectboxColumn(options=["estimado", "final"]),
                },
                key="grilla_precios",
            )

            if st.button("Guardar precios cargados", type="primary"):
                cargados = 0
                for _, fila in editado.iterrows():
                    if fila["NuevoPrecio"] in (None, "", 0) or pd.isna(fila["NuevoPrecio"]):
                        continue
                    db.insertar(conn, "precios", dict(
                        periodo=periodo, producto=fila["Producto"], proveedor=fila["Proveedor"],
                        precio=float(fila["NuevoPrecio"]), moneda=fila["Moneda"], tipo=fila["Tipo"],
                        fuente=fila["Fuente"] or None, fecha_carga=db.ahora(),
                        creado_por=db.USUARIO_POR_DEFECTO,
                    ))
                    cargados += 1
                if cargados:
                    st.success(f"Se cargaron {cargados} precios nuevos.")
                    st.rerun()
                else:
                    st.warning("No completaste ningún precio nuevo.")

    # -- Formulario individual -------------------------------------------
    with tab_form:
        with st.form("form_precio"):
            c1, c2 = st.columns(2)
            periodo_f = c1.text_input("Período (AAAA-MM)", value=periodo)
            producto_f = c2.text_input("Producto")
            c3, c4 = st.columns(2)
            proveedor_f = c3.text_input("Proveedor")
            precio_f = c4.number_input("Precio", min_value=0.0)
            c5, c6, c7 = st.columns(3)
            moneda_f = c5.selectbox("Moneda", bootstrap.MONEDAS)
            tipo_f = c6.selectbox("Tipo", ["estimado", "final"])
            fuente_f = c7.text_input("Fuente")
            enviado = st.form_submit_button("Guardar precio")

        if enviado:
            errores = []
            if not periodo_f:
                errores.append("Falta el período.")
            if not producto_f:
                errores.append("Falta el producto.")
            if not proveedor_f:
                errores.append("Falta el proveedor.")
            if precio_f <= 0:
                errores.append("El precio tiene que ser mayor a cero.")
            if errores:
                for e in errores:
                    st.error(e)
            else:
                db.insertar(conn, "precios", dict(
                    periodo=periodo_f, producto=producto_f, proveedor=proveedor_f,
                    precio=precio_f, moneda=moneda_f, tipo=tipo_f, fuente=fuente_f or None,
                    fecha_carga=db.ahora(), creado_por=db.USUARIO_POR_DEFECTO,
                ))
                st.success("Precio cargado como una versión nueva (no se pisó ningún precio anterior).")
                st.rerun()

    # -- Historial --------------------------------------------------------
    with tab_historial:
        proveedores = bootstrap.valores_distintos(conn, "precios", "proveedor")
        productos = bootstrap.valores_distintos(conn, "precios", "producto")
        c1, c2 = st.columns(2)
        f_prov = c1.selectbox("Proveedor", ["(todos)"] + proveedores)
        f_prod = c2.selectbox("Producto", ["(todos)"] + productos)

        historial = db.listar(conn, "precios", orden="fecha_carga DESC")
        if f_prov != "(todos)":
            historial = [h for h in historial if h["proveedor"] == f_prov]
        if f_prod != "(todos)":
            historial = [h for h in historial if h["producto"] == f_prod]

        st.dataframe(pd.DataFrame(db.filas_a_dicts(historial)), use_container_width=True, hide_index=True)
        st.caption("Cada fila es una versión. La vigente es la FINAL más reciente; si no hay final, la ESTIMADA más reciente.")

    # -- Tipo de cambio de referencia --------------------------------------
    with tab_tc:
        st.caption(
            "Se usa para separar el delta por precio del delta por tipo de "
            "cambio cuando el proveedor factura en una moneda distinta a la del precio."
        )
        with st.form("form_tc"):
            c1, c2, c3 = st.columns(3)
            periodo_tc = c1.text_input("Período (AAAA-MM)", value=periodo, key="periodo_tc")
            moneda_tc = c2.selectbox("Moneda", [m for m in bootstrap.MONEDAS if m != "USD"])
            tasa_tc = c3.number_input("Tasa (unidades de esa moneda por 1 USD)", min_value=0.0)
            enviado_tc = st.form_submit_button("Guardar tipo de cambio")
        if enviado_tc and periodo_tc and tasa_tc > 0:
            conn.execute(
                """INSERT INTO tipos_cambio (periodo, moneda, tasa, fecha_carga) VALUES (?, ?, ?, ?)
                   ON CONFLICT(periodo, moneda) DO UPDATE SET tasa = excluded.tasa, fecha_carga = excluded.fecha_carga""",
                (periodo_tc, moneda_tc, tasa_tc, db.ahora()),
            )
            st.success("Tipo de cambio de referencia guardado.")
            st.rerun()

        tc_actuales = conn.execute("SELECT * FROM tipos_cambio ORDER BY periodo DESC").fetchall()
        st.dataframe(pd.DataFrame(db.filas_a_dicts(tc_actuales)), use_container_width=True, hide_index=True)
