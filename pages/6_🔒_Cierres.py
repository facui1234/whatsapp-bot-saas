"""Cierre contable: congela un snapshot del período, exporta el asiento de
provisión, y muestra los ajustes posteriores, las tolerancias configurables
y el registro de auditoría."""
from __future__ import annotations

import io

import pandas as pd
import streamlit as st

from core import bootstrap, db, repository as repo

st.set_page_config(page_title="Cierres", page_icon="🔒", layout="wide")
bootstrap.asegurar_base()
bootstrap.mostrar_barra_lateral()
st.title("🔒 Cierre contable")

with db.conectar() as conn:
    (
        tab_cerrar, tab_historico, tab_ajustes, tab_tolerancias, tab_auditoria,
    ) = st.tabs([
        "Cerrar período", "Histórico de cierres", "Ajustes posteriores",
        "⚙️ Tolerancias", "📝 Auditoría",
    ])

    # -- Cerrar período ------------------------------------------------------
    with tab_cerrar:
        periodos = repo.periodos_disponibles(conn)
        cerrados = set(repo.periodos_cerrados(conn))
        abiertos = [p for p in periodos if p not in cerrados]

        if not abiertos:
            st.info("No hay períodos abiertos para cerrar.")
        else:
            periodo_a_cerrar = st.selectbox("Período a cerrar", abiertos)
            filas = repo.calcular_todas(conn, periodo=periodo_a_cerrar)

            tabla = [dict(
                Entrega=e["id"], Proveedor=e["proveedor"], Producto=e["producto"],
                Precio=r.tipo_precio_usado or "-", ValorTeorico=r.valor_teorico,
                Documentado=r.neto_documentado_moneda_precio, Delta=r.delta_total,
                Estado=r.estado,
            ) for e, r in filas]
            st.dataframe(pd.DataFrame(tabla), width="stretch", hide_index=True)

            sin_conciliar = [r for _, r in filas if r.estado not in (
                "conciliada",)]
            if sin_conciliar:
                st.warning(
                    f"Hay {len(sin_conciliar)} entrega(s) sin conciliar. Se pueden cerrar "
                    "igual: el snapshot va a dejar registrada la provisión pendiente."
                )

            st.markdown(
                "Al cerrar: se congela un snapshot con volumen, precio usado, si era "
                "estimado o final, valor teórico, documentado y provisión a registrar. "
                "**Un período cerrado no se puede volver a modificar.**"
            )
            confirmar = st.checkbox(f"Confirmo que quiero cerrar el período {periodo_a_cerrar} (es definitivo)")
            if st.button("🔒 Cerrar período", type="primary", disabled=not confirmar):
                repo.cerrar_periodo(conn, periodo_a_cerrar, usuario=db.USUARIO_POR_DEFECTO)
                st.success(f"Período {periodo_a_cerrar} cerrado.")
                st.rerun()

    # -- Histórico -------------------------------------------------------------
    with tab_historico:
        cierres = repo.listar_cierres(conn)
        if not cierres:
            st.info("Todavía no se cerró ningún período.")
        else:
            opciones = [c["periodo"] for c in cierres]
            periodo_ver = st.selectbox("Período cerrado", opciones)
            cierre = next(c for c in cierres if c["periodo"] == periodo_ver)
            st.caption(f"Cerrado el {cierre['fecha_cierre']} por {cierre['cerrado_por']}")

            snapshot = repo.snapshot_de_cierre(conn, periodo_ver)
            df_snap = pd.DataFrame(snapshot)
            st.dataframe(df_snap, width="stretch", hide_index=True)

            asiento = repo.asiento_provision(snapshot)
            st.subheader("Asiento de provisión")
            if not asiento:
                st.caption("No hay provisión a registrar para este período (todo estaba conciliado al cierre).")
            else:
                df_asiento = pd.DataFrame(asiento)
                st.dataframe(df_asiento, width="stretch", hide_index=True)

                buffer_xlsx = io.BytesIO()
                with pd.ExcelWriter(buffer_xlsx, engine="openpyxl") as writer:
                    df_asiento.to_excel(writer, index=False, sheet_name="asiento_provision")
                c1, c2 = st.columns(2)
                c1.download_button(
                    "📥 Exportar asiento a Excel", data=buffer_xlsx.getvalue(),
                    file_name=f"asiento_provision_{periodo_ver}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                c2.download_button(
                    "📥 Exportar asiento a CSV", data=df_asiento.to_csv(index=False).encode("utf-8"),
                    file_name=f"asiento_provision_{periodo_ver}.csv", mime="text/csv",
                )

    # -- Ajustes posteriores ------------------------------------------------------
    with tab_ajustes:
        st.caption(
            "Cuando un precio pasa de estimado a final DESPUÉS de cerrado el "
            "período, acá queda el ajuste como movimiento del mes corriente "
            "(el período cerrado original nunca se modifica)."
        )
        ajustes = repo.listar_ajustes_posteriores(conn)
        if not ajustes:
            st.info("No hay ajustes posteriores registrados.")
        else:
            st.dataframe(pd.DataFrame(db.filas_a_dicts(ajustes)), width="stretch", hide_index=True)

    # -- Tolerancias --------------------------------------------------------------
    with tab_tolerancias:
        st.caption("La tolerancia define a partir de qué monto de delta se considera que falta un documento.")
        tolerancia_global = db.obtener_tolerancia_global(conn)
        nueva_tolerancia = st.number_input("Tolerancia global (USD)", min_value=0.0, value=float(tolerancia_global))
        if st.button("Guardar tolerancia global"):
            db.set_config(conn, "tolerancia_global", str(nueva_tolerancia))
            st.success("Tolerancia global actualizada.")
            st.rerun()

        st.markdown("**Tolerancias por proveedor** (si no se define una acá, se usa la global)")
        tolerancias_prov = db.obtener_tolerancias_proveedor(conn)
        proveedores = bootstrap.valores_distintos(conn, "entregas", "proveedor")
        df_tol = pd.DataFrame([
            dict(Proveedor=p, Tolerancia=tolerancias_prov.get(p, tolerancia_global))
            for p in proveedores
        ])
        editado = st.data_editor(df_tol, width="stretch", hide_index=True, disabled=["Proveedor"], key="tol_editor")
        if st.button("Guardar tolerancias por proveedor"):
            for _, fila in editado.iterrows():
                db.set_tolerancia_proveedor(conn, fila["Proveedor"], float(fila["Tolerancia"]))
            st.success("Tolerancias por proveedor actualizadas.")
            st.rerun()

    # -- Auditoría --------------------------------------------------------------
    with tab_auditoria:
        st.caption("Quién cargó o modificó qué y cuándo.")
        tablas = bootstrap.valores_distintos(conn, "auditoria", "tabla")
        c1, c2 = st.columns(2)
        f_tabla = c1.multiselect("Tabla", tablas)
        f_accion = c2.multiselect("Acción", ["crear", "editar", "eliminar", "importar", "cerrar", "seed"])

        registros = db.obtener_auditoria(conn, limite=1000)
        if f_tabla:
            registros = [r for r in registros if r["tabla"] in f_tabla]
        if f_accion:
            registros = [r for r in registros if r["accion"] in f_accion]
        st.dataframe(pd.DataFrame(db.filas_a_dicts(registros)), width="stretch", hide_index=True)
