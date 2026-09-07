import pytest

from core import db


@pytest.fixture
def db_conn():
    conn = db.get_connection(":memory:")
    conn.executescript(db.SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
