# -*- mode: python ; coding: utf-8 -*-
"""Receta de PyInstaller para armar el ejecutable.

No hace falta tocar nada acá: se usa desde `construir_exe.bat` (Windows) o
`construir_exe.sh` (Mac/Linux).

Si querés que arranque MÁS RÁPIDO y no te molesta que en vez de un solo
archivo quede una carpeta con el .exe adentro, poné UN_SOLO_ARCHIVO = False.
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

UN_SOLO_ARCHIVO = True
NOMBRE = "ConciliacionCrudo"

# Archivos propios de la app que tienen que viajar adentro del ejecutable.
datas = [
    ("app.py", "."),
    ("pages", "pages"),
    ("core", "core"),
]
binaries = []
hiddenimports = ["openpyxl"]

# Streamlit y altair necesitan sus archivos estáticos (el HTML/JS de la
# interfaz, los esquemas de los gráficos), no alcanza con el código Python.
for paquete in ("streamlit", "altair"):
    paquete_datas, paquete_binaries, paquete_hidden = collect_all(paquete)
    datas += paquete_datas
    binaries += paquete_binaries
    hiddenimports += paquete_hidden

hiddenimports += collect_submodules("openpyxl")

# Varias librerías consultan su propia versión en tiempo de ejecución
# (importlib.metadata), así que hay que incluir sus metadatos.
for distribucion in (
    "streamlit", "pandas", "numpy", "altair", "openpyxl", "pyarrow", "packaging",
    "pydeck", "tornado", "watchdog", "click", "protobuf", "tenacity",
):
    try:
        datas += copy_metadata(distribucion)
    except Exception:
        pass  # si esa librería no está instalada, no pasa nada

a = Analysis(
    ["lanzador.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "PyInstaller"],
    noarchive=False,
)

pyz = PYZ(a.pure)

if UN_SOLO_ARCHIVO:
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name=NOMBRE,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=True,  # deja ver el mensaje de "arrancando" y sirve para cerrar la app
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name=NOMBRE,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=True,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name=NOMBRE,
    )
