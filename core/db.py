"""Conexión y helpers de persistencia sobre SQLite.

Toda la app usa un único archivo de base de datos local
(``data/conciliacion.db``). No hay servicios externos ni Docker: la base
es un archivo que se crea solo la primera vez que se corre la app.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Iterator

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "conciliacion.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

USUARIO_POR_DEFECTO = "usuario_local"


def ahora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def get_connection(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def conectar(db_path: Path | str = DB_PATH) -> Iterator[sqlite3.Connection]:
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def inicializar_db(db_path: Path | str = DB_PATH) -> None:
    """Crea las tablas si no existen. Es seguro llamarla siempre al arrancar."""
    with conectar(db_path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def esta_vacia(conn: sqlite3.Connection) -> bool:
    fila = conn.execute("SELECT COUNT(*) AS n FROM entregas").fetchone()
    return fila["n"] == 0


# ---------------------------------------------------------------------------
# Auditoría
# ---------------------------------------------------------------------------

def registrar_auditoria(
    conn: sqlite3.Connection,
    tabla: str,
    registro_id: int | None,
    accion: str,
    detalle: dict | str | None = None,
    usuario: str = USUARIO_POR_DEFECTO,
) -> None:
    if isinstance(detalle, dict):
        detalle = json.dumps(detalle, ensure_ascii=False, default=str)
    conn.execute(
        """INSERT INTO auditoria (fecha, usuario, tabla, registro_id, accion, detalle)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (ahora(), usuario, tabla, registro_id, accion, detalle),
    )


def obtener_auditoria(conn: sqlite3.Connection, limite: int = 500) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM auditoria ORDER BY id DESC LIMIT ?", (limite,)
    ).fetchall()


# ---------------------------------------------------------------------------
# Configuración (tolerancias, etc.)
# ---------------------------------------------------------------------------

TOLERANCIA_GLOBAL_DEFAULT = 500.0


def obtener_config(conn: sqlite3.Connection, clave: str, default: str | None = None) -> str | None:
    fila = conn.execute("SELECT valor FROM configuracion WHERE clave = ?", (clave,)).fetchone()
    return fila["valor"] if fila else default


def set_config(conn: sqlite3.Connection, clave: str, valor: str) -> None:
    conn.execute(
        """INSERT INTO configuracion (clave, valor) VALUES (?, ?)
           ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor""",
        (clave, valor),
    )


def obtener_tolerancia_global(conn: sqlite3.Connection) -> float:
    return float(obtener_config(conn, "tolerancia_global", str(TOLERANCIA_GLOBAL_DEFAULT)))


def obtener_tolerancias_proveedor(conn: sqlite3.Connection) -> dict[str, float]:
    filas = conn.execute("SELECT proveedor, tolerancia FROM tolerancias_proveedor").fetchall()
    return {f["proveedor"]: f["tolerancia"] for f in filas}


def set_tolerancia_proveedor(conn: sqlite3.Connection, proveedor: str, tolerancia: float) -> None:
    conn.execute(
        """INSERT INTO tolerancias_proveedor (proveedor, tolerancia) VALUES (?, ?)
           ON CONFLICT(proveedor) DO UPDATE SET tolerancia = excluded.tolerancia""",
        (proveedor, tolerancia),
    )


# ---------------------------------------------------------------------------
# CRUD genéricos usados por las páginas de Streamlit
# ---------------------------------------------------------------------------

def listar(conn: sqlite3.Connection, tabla: str, orden: str = "id DESC") -> list[sqlite3.Row]:
    return conn.execute(f"SELECT * FROM {tabla} ORDER BY {orden}").fetchall()


def obtener_por_id(conn: sqlite3.Connection, tabla: str, id_: int) -> sqlite3.Row | None:
    return conn.execute(f"SELECT * FROM {tabla} WHERE id = ?", (id_,)).fetchone()


def insertar(
    conn: sqlite3.Connection,
    tabla: str,
    datos: dict[str, Any],
    usuario: str = USUARIO_POR_DEFECTO,
) -> int:
    columnas = list(datos.keys())
    placeholders = ", ".join(["?"] * len(columnas))
    sql = f"INSERT INTO {tabla} ({', '.join(columnas)}) VALUES ({placeholders})"
    cur = conn.execute(sql, [datos[c] for c in columnas])
    nuevo_id = cur.lastrowid
    registrar_auditoria(conn, tabla, nuevo_id, "crear", datos, usuario)
    return nuevo_id


def actualizar(
    conn: sqlite3.Connection,
    tabla: str,
    id_: int,
    datos: dict[str, Any],
    usuario: str = USUARIO_POR_DEFECTO,
) -> None:
    set_clause = ", ".join([f"{c} = ?" for c in datos])
    sql = f"UPDATE {tabla} SET {set_clause} WHERE id = ?"
    conn.execute(sql, [*datos.values(), id_])
    registrar_auditoria(conn, tabla, id_, "editar", datos, usuario)


def eliminar(conn: sqlite3.Connection, tabla: str, id_: int, usuario: str = USUARIO_POR_DEFECTO) -> None:
    conn.execute(f"DELETE FROM {tabla} WHERE id = ?", (id_,))
    registrar_auditoria(conn, tabla, id_, "eliminar", None, usuario)


def filas_a_dicts(filas: Iterable[sqlite3.Row]) -> list[dict]:
    return [dict(f) for f in filas]
