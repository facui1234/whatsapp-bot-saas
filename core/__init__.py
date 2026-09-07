"""Módulo central de la app de conciliación de compras de crudo.

Está separado de la interfaz (Streamlit) a propósito: `db.py` maneja la
persistencia, `reconciliation.py` y `matching.py` contienen la lógica de
negocio pura (testeable sin base de datos ni UI), y `importers.py` /
`templates.py` / `validators.py` resuelven la carga masiva de datos.
"""
