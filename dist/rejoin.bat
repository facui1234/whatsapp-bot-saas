@echo off
REM Rejoin WhatsBot SaaS portable parts into a working .exe
echo Uniendo partes...
copy /b WhatsBot-part00.bin + WhatsBot-part01.bin + WhatsBot-part02.bin WhatsBot-SaaS-1.0.0-portable.exe
if exist WhatsBot-SaaS-1.0.0-portable.exe (
  echo.
  echo Listo! Ejecutable creado: WhatsBot-SaaS-1.0.0-portable.exe
  echo Tamano:
  dir WhatsBot-SaaS-1.0.0-portable.exe | findstr "portable"
  echo.
  echo Hace doble click en WhatsBot-SaaS-1.0.0-portable.exe para abrir la app.
) else (
  echo ERROR: No se pudo crear el ejecutable
)
pause
