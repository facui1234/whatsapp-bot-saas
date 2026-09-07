"""Punto de entrada del ejecutable (.exe / binario).

No se usa cuando corrés la app con `streamlit run app.py`: sirve para que,
al hacer doble clic en el ejecutable, se levante el servidor de Streamlit y
se abra el navegador solo, sin que el usuario tenga que escribir nada.

Se arma con PyInstaller usando `ConciliacionCrudo.spec` (ver
`construir_exe.bat` en Windows o `construir_exe.sh` en Mac/Linux).
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

PUERTO_PREFERIDO = 8501


def carpeta_base() -> Path:
    """Carpeta donde están `app.py` y `pages/`.

    En el ejecutable es la carpeta temporal donde PyInstaller descomprime
    todo; corriendo desde el código fuente es la carpeta del proyecto.
    """
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parent


def buscar_puerto_libre(preferido: int = PUERTO_PREFERIDO) -> int:
    """Usa el puerto de siempre; si está ocupado (porque ya hay otra copia
    abierta), busca el siguiente libre para no fallar."""
    for puerto in range(preferido, preferido + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", puerto)) != 0:
                return puerto
    return 0  # 0 = que el sistema operativo elija uno cualquiera


def abrir_navegador_cuando_levante(url: str, espera_segundos: float = 4.0) -> None:
    def _abrir() -> None:
        try:
            webbrowser.open(url)
        except Exception:
            pass  # si falla, el usuario igual tiene la dirección en pantalla

    threading.Timer(espera_segundos, _abrir).start()


def main() -> None:
    base = carpeta_base()
    os.chdir(base)
    sys.path.insert(0, str(base))

    script = str(base / "app.py")
    puerto = buscar_puerto_libre()
    url = f"http://localhost:{puerto}"

    print("=" * 62)
    print("  Conciliación de compras de crudo")
    print("=" * 62)
    print()
    print("  Arrancando... la primera vez puede tardar unos segundos.")
    print(f"  Cuando esté lista se abre sola en: {url}")
    print()
    print("  >> NO CIERRES ESTA VENTANA mientras uses la aplicación. <<")
    print("     Para cerrar la app, cerrá esta ventana o apretá Ctrl+C.")
    print()
    print("=" * 62)

    abrir_navegador_cuando_levante(url)

    import streamlit.web.cli as stcli

    sys.argv = [
        "streamlit",
        "run",
        script,
        f"--server.port={puerto}",
        "--server.headless=true",          # que no intente abrir el navegador ni pedir mail
        "--server.fileWatcherType=none",   # no hace falta vigilar archivos en el ejecutable
        "--browser.gatherUsageStats=false",
        "--global.developmentMode=false",
    ]
    sys.exit(stcli.main())


if __name__ == "__main__":
    main()
