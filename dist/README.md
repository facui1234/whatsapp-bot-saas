# WhatsBot SaaS — Ejecutable distribuido

El ejecutable portable de Windows (`WhatsBot-SaaS-1.0.0-portable.exe`, ~74 MB) está partido en **3 piezas** porque GitHub recomienda evitar archivos de más de 50 MB.

## Cómo armar el .exe

### Windows
1. Descargá los 4 archivos a la misma carpeta:
   - `WhatsBot-part00.bin`
   - `WhatsBot-part01.bin`
   - `WhatsBot-part02.bin`
   - `rejoin.bat`
2. **Doble click en `rejoin.bat`**
3. Se crea `WhatsBot-SaaS-1.0.0-portable.exe` — doble click para correr la app

### Linux / Mac (con Wine)
```bash
chmod +x rejoin.sh && ./rejoin.sh
```

## Verificación (opcional)
```bash
sha256sum WhatsBot-SaaS-1.0.0-portable.exe
# Esperado: ver SHA256SUMS abajo
```

## Primera ejecución

- La app descarga MongoDB embebido (~80 MB) en `%AppData%\WhatsBot SaaS\mongo-binaries\` la primera vez
- Aparece la ventana de configuración pidiendo `ANTHROPIC_API_KEY`
- Después ya levanta directo

## Por qué partido en piezas

GitHub no permite archivos > 100 MB sin Git LFS, y avisa con > 50 MB.
Las piezas de 22-26 MB cada una se descargan rápido individualmente y se reensamblan en segundos en tu máquina.
