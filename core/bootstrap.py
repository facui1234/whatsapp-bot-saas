"""Arranque de la app: crea el esquema y carga los datos de ejemplo la
primera vez. Todas las páginas de Streamlit llaman a `asegurar_base()`
antes de hacer cualquier otra cosa.
"""
from __future__ import annotations

from core import db, seed

PROVEEDORES_EJEMPLO = ["PetroSur SA", "Crudos del Norte SRL", "YPF Trading"]
PRODUCTOS_EJEMPLO = ["Medanito", "Escalante", "Cañadón Seco"]
UNIDADES_VOLUMEN = ["m3", "bbl"]
MONEDAS = ["USD", "ARS"]


def asegurar_base() -> None:
    db.inicializar_db()
    with db.conectar() as conn:
        seed.cargar_datos_demo(conn)


def valores_distintos(conn, tabla: str, columna: str) -> list[str]:
    filas = conn.execute(f"SELECT DISTINCT {columna} FROM {tabla} WHERE {columna} IS NOT NULL").fetchall()
    valores = sorted({f[columna] for f in filas if f[columna]})
    return valores
