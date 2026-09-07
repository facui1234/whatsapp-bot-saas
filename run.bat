@echo off
REM Arranca la aplicacion con un solo doble click (o "run.bat" en la consola).
cd /d "%~dp0"

if not exist ".venv" (
    echo Creando entorno virtual .venv...
    python -m venv .venv
)

call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
streamlit run app.py
