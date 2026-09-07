"""Carga de documentos (FACTURA / ND / NC) y bandeja de pendientes de
imputar: lo que el matcheo automático no pudo asignar solo."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import bootstrap, db, repository as repo

st.set_page_config(page_title="Documentos", page_icon="📄", layout="wide")
bootstrap.asegurar_base()
st.title("📄 Documentos")

TIPOS_DOC = ["FACTURA", "ND", "NC"]

with db.conectar() as conn:
    tab_alta, tab_listado, tab_pendientes = st.tabs(
        ["Cargar documento", "Listado", "🕓 Pendientes de imputar"]
    )

    # -- Alta --------------------------------------------------------------
    with tab_alta:
        st.caption(
            "Para una ND/NC que ajusta VOLUMEN (medición final, mermas, %BSW), "
            "cargá el volumen con signo: negativo si reduce el volumen "
            "facturado, positivo si lo aumenta. Si el documento no toca "
            "volumen, dejalo vacío."
        )
        with st.form("form_documento"):
            c1, c2, c3 = st.columns(3)
            tipo = c1.selectbox("Tipo", TIPOS_DOC)
            numero = c2.text_input("Número")
            fecha = c3.text_input("Fecha (AAAA-MM-DD)")

            c4, c5 = st.columns(2)
            proveedor = c4.text_input("Proveedor")
            referencia = c5.text_input("Referencia (OC o remito)")

            c6, c7, c8 = st.columns(3)
            neto_sin_iva = c6.number_input("Neto sin IVA", min_value=0.0)
            moneda = c7.selectbox("Moneda", bootstrap.MONEDAS)
            tipo_cambio = c8.number_input("Tipo de cambio aplicado (si moneda ≠ USD)", min_value=0.0, value=0.0)

            c9, c10 = st.columns(2)
            volumen_facturado = c9.number_input("Volumen (con signo si es ajuste)", value=0.0, step=1.0, format="%.2f")
            precio_unitario = c10.number_input("Precio unitario (informativo)", min_value=0.0, value=0.0)

            enviado = st.form_submit_button("Guardar documento")

        if enviado:
            errores = []
            if not numero:
                errores.append("Falta el número de documento.")
            if not fecha:
                errores.append("Falta la fecha.")
            if not proveedor:
                errores.append("Falta el proveedor.")
            if neto_sin_iva <= 0:
                errores.append("El neto sin IVA tiene que ser mayor a cero.")
            if moneda != "USD" and tipo_cambio <= 0:
                errores.append("Si la moneda no es USD, tenés que informar el tipo de cambio aplicado.")

            if errores:
                for e in errores:
                    st.error(e)
            else:
                nuevo_id = db.insertar(conn, "documentos", dict(
                    tipo=tipo, numero=numero, fecha=fecha, proveedor=proveedor,
                    neto_sin_iva=neto_sin_iva, moneda=moneda,
                    tipo_cambio=tipo_cambio if moneda != "USD" else None,
                    volumen_facturado=volumen_facturado if volumen_facturado != 0 else None,
                    precio_unitario=precio_unitario or None, referencia=referencia or None,
                    origen="manual", creado_por=db.USUARIO_POR_DEFECTO, creado_en=db.ahora(),
                ))
                resultado_match = repo.sugerencias_para_documento(conn, db.obtener_por_id(conn, "documentos", nuevo_id))
                if resultado_match.match_automatico is not None:
                    repo.crear_imputacion(
                        conn, resultado_match.match_automatico.entrega_id, nuevo_id,
                        monto_imputado=neto_sin_iva, volumen_imputado=volumen_facturado or None,
                        metodo=resultado_match.match_automatico.metodo,
                        confianza=resultado_match.match_automatico.confianza,
                    )
                    repo.actualizar_estado_entrega(conn, resultado_match.match_automatico.entrega_id)
                    st.success(
                        f"Documento #{nuevo_id} cargado e imputado automáticamente "
                        f"a la entrega #{resultado_match.match_automatico.entrega_id} "
                        "(match exacto por OC/remito)."
                    )
                else:
                    st.success(f"Documento #{nuevo_id} cargado. Quedó en 'Pendientes de imputar'.")
                st.rerun()

    # -- Listado -------------------------------------------------------------
    with tab_listado:
        proveedores = bootstrap.valores_distintos(conn, "documentos", "proveedor")
        c1, c2 = st.columns(2)
        f_prov = c1.multiselect("Proveedor", proveedores)
        f_tipo = c2.multiselect("Tipo", TIPOS_DOC)

        documentos = db.listar(conn, "documentos", orden="fecha DESC")
        if f_prov:
            documentos = [d for d in documentos if d["proveedor"] in f_prov]
        if f_tipo:
            documentos = [d for d in documentos if d["tipo"] in f_tipo]
        st.dataframe(pd.DataFrame(db.filas_a_dicts(documentos)), width='stretch', hide_index=True)

    # -- Pendientes de imputar ------------------------------------------------
    with tab_pendientes:
        pendientes = repo.documentos_sin_imputar(conn)
        if not pendientes:
            st.success("No hay documentos pendientes de imputar. 🎉")
        else:
            st.caption(f"{len(pendientes)} documento(s) sin asignar a ninguna entrega.")
            for doc in pendientes:
                with st.expander(
                    f"{doc['tipo']} {doc['numero']} · {doc['proveedor']} · "
                    f"neto {doc['neto_sin_iva']:,.2f} {doc['moneda']} · ref: {doc['referencia'] or '-'}"
                ):
                    resultado_match = repo.sugerencias_para_documento(conn, doc)
                    entregas_todas = db.listar(conn, "entregas")
                    entregas_del_proveedor = [e for e in entregas_todas if e["proveedor"] == doc["proveedor"]]

                    ids_sugeridos = [s.entrega_id for s in resultado_match.sugerencias]
                    opciones_ids = ids_sugeridos + [
                        e["id"] for e in entregas_del_proveedor if e["id"] not in ids_sugeridos
                    ]
                    if not opciones_ids:
                        st.warning("No hay ninguna entrega de este proveedor para sugerir. Cargala primero en 'Entregas'.")
                        continue

                    entregas_por_id = {e["id"]: e for e in entregas_todas}
                    confianza_por_id = {s.entrega_id: s for s in resultado_match.sugerencias}

                    def etiqueta(entrega_id: int) -> str:
                        e = entregas_por_id[entrega_id]
                        sug = confianza_por_id.get(entrega_id)
                        extra = f" (sugerido: {sug.metodo}, confianza {sug.confianza:.0%})" if sug else ""
                        return f"#{e['id']} · remito {e['remito'] or '-'} · OC {e['contrato_oc'] or '-'} · {e['volumen']} {e['unidad_volumen']}{extra}"

                    entrega_elegida = st.selectbox(
                        "Imputar a la entrega", opciones_ids, format_func=etiqueta, key=f"sel_{doc['id']}"
                    )
                    ya_imputado = repo.monto_imputado_total(conn, doc["id"])
                    restante = doc["neto_sin_iva"] - ya_imputado
                    c1, c2 = st.columns(2)
                    monto = c1.number_input("Monto a imputar", value=float(restante), key=f"monto_{doc['id']}")
                    volumen = c2.number_input(
                        "Volumen a imputar (opcional, con signo)", value=0.0, key=f"vol_{doc['id']}"
                    )
                    if st.button("Imputar", key=f"btn_{doc['id']}"):
                        metodo = confianza_por_id.get(entrega_elegida)
                        repo.crear_imputacion(
                            conn, entrega_elegida, doc["id"], monto_imputado=monto,
                            volumen_imputado=volumen or None,
                            metodo=metodo.metodo if metodo else "manual",
                            confianza=metodo.confianza if metodo else None,
                        )
                        repo.actualizar_estado_entrega(conn, entrega_elegida)
                        st.success(f"Documento #{doc['id']} imputado a la entrega #{entrega_elegida}.")
                        st.rerun()
