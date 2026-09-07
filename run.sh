#!/usr/bin/env bash
# Arranca la aplicación con un solo comando.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creando entorno virtual (.venv)..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt
streamlit run app.py
