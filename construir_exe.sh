#!/usr/bin/env bash
# ============================================================
#  Arma el ejecutable (Mac / Linux). En Windows usá construir_exe.bat.
#  Se corre UNA sola vez: después usás directamente el ejecutable.
# ============================================================
set -e
cd "$(dirname "$0")"

echo
echo "=== 1/3 Preparando el entorno ==="
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
pip install -q pyinstaller

echo
echo "=== 2/3 Armando el ejecutable (esto tarda varios minutos) ==="
pyinstaller --noconfirm --clean ConciliacionCrudo.spec

echo
echo "=== 3/3 Listo ==="
echo
echo "  Tu ejecutable quedó en:  dist/ConciliacionCrudo"
echo
echo "  OJO: la base de datos se crea en una carpeta 'data' AL LADO del"
echo "  ejecutable. Si lo movés, llevate también esa carpeta 'data'."
echo
