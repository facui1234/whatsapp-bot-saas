@echo off
REM ============================================================
REM  Arma el ejecutable ConciliacionCrudo.exe (Windows).
REM  Se corre UNA sola vez: despues usas directamente el .exe.
REM ============================================================
cd /d "%~dp0"

echo.
echo === 1/3 Preparando el entorno ===
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
pip install -q pyinstaller

echo.
echo === 2/3 Armando el ejecutable (esto tarda varios minutos) ===
pyinstaller --noconfirm --clean ConciliacionCrudo.spec
if errorlevel 1 goto error

echo.
echo === 3/3 Listo ===
echo.
echo   Tu ejecutable quedo en:  dist\ConciliacionCrudo.exe
echo.
echo   Copialo a donde quieras (Escritorio, una carpeta de red, un pendrive)
echo   y hace doble clic para usar la aplicacion.
echo.
echo   OJO: la base de datos se crea en una carpeta "data" AL LADO del .exe.
echo   Si movés el .exe, llevate tambien esa carpeta "data".
echo.
pause
exit /b 0

:error
echo.
echo Hubo un error armando el ejecutable. Copiá el texto de arriba y pedí ayuda.
pause
exit /b 1
