@echo off
REM Rejoin WhatsBot SaaS portable parts into a working .exe
setlocal

REM Cambiar al directorio donde esta este script (donde estan los .bin)
cd /d "%~dp0"

echo.
echo === WhatsBot SaaS - Reensamblando ejecutable ===
echo.
echo Carpeta actual: %CD%
echo.

REM Verificar que existan las 3 partes
set MISSING=0
if not exist "WhatsBot-part00.bin" (
  echo [X] Falta: WhatsBot-part00.bin
  set MISSING=1
) else (
  echo [OK] WhatsBot-part00.bin
)
if not exist "WhatsBot-part01.bin" (
  echo [X] Falta: WhatsBot-part01.bin
  set MISSING=1
) else (
  echo [OK] WhatsBot-part01.bin
)
if not exist "WhatsBot-part02.bin" (
  echo [X] Falta: WhatsBot-part02.bin
  set MISSING=1
) else (
  echo [OK] WhatsBot-part02.bin
)

if %MISSING%==1 (
  echo.
  echo ERROR: Faltan archivos. Asegurate de que los 3 .bin esten en
  echo        la misma carpeta que este rejoin.bat
  echo.
  pause
  exit /b 1
)

echo.
echo Uniendo partes...
copy /b "WhatsBot-part00.bin" + "WhatsBot-part01.bin" + "WhatsBot-part02.bin" "WhatsBot-SaaS-1.0.0-portable.exe" >nul

if exist "WhatsBot-SaaS-1.0.0-portable.exe" (
  echo.
  echo === LISTO ===
  echo.
  echo Ejecutable creado: WhatsBot-SaaS-1.0.0-portable.exe
  for %%A in ("WhatsBot-SaaS-1.0.0-portable.exe") do echo Tamano: %%~zA bytes
  echo.
  echo Hace doble click en WhatsBot-SaaS-1.0.0-portable.exe para abrir la app.
  echo.
) else (
  echo.
  echo ERROR: No se pudo crear el ejecutable.
  echo.
)

pause
endlocal
