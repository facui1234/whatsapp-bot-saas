# Cómo generar el ejecutable

WhatsBot SaaS se empaqueta como aplicación de escritorio de Windows usando Electron + electron-builder. Incluye **MongoDB embebido** (vía `mongodb-memory-server`), así que el ejecutable es 100% self-contained.

## Prerequisitos

- Node.js 18+ y npm
- En Linux: `wine` y `xvfb-run` (solo para cross-build de Windows)
  - El sandbox/dev container ya los trae instalados

## Generar el ejecutable

```bash
./build-app.sh portable        # Single-file .exe (recomendado)
./build-app.sh installer       # NSIS installer (.exe que instala en Program Files)
./build-app.sh both            # Genera ambos
```

O usando npm directamente:

```bash
npm run dist:portable          # Solo portable
npm run dist:win               # Portable + NSIS installer
npm run pack                   # Unpacked dir (para debug)
```

## Salida

Los artefactos se generan en `release/`:

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `WhatsBot-SaaS-1.0.0-portable.exe` | ~74 MB | **Single-file portable**. Doble click y se ejecuta. No necesita instalación |
| `WhatsBot-SaaS-1.0.0-x64.exe` | ~80 MB | Installer NSIS. Crea shortcuts en escritorio y menú inicio |
| `win-unpacked/` | ~294 MB | Directorio sin empaquetar (útil para debug) |

## Distribución

Para que un usuario use la aplicación:

1. Descarga `WhatsBot-SaaS-1.0.0-portable.exe`
2. Hace doble click — se abre la app
3. **Primera ejecución**:
   - Descarga el binario de MongoDB (~80 MB, una sola vez, queda en `%AppData%/WhatsBot SaaS/mongo-binaries`)
   - Aparece una ventana de configuración pidiendo el `ANTHROPIC_API_KEY`
4. La app guarda todos los datos en `%AppData%/WhatsBot SaaS/`:
   - `mongo-data/` — base de datos
   - `mongo-binaries/` — binario de MongoDB descargado
   - `settings.json` — API keys
   - `app.log` — logs de la app

## Estructura del package

El `.exe` portable contiene:
- Runtime de Electron (~150 MB)
- Express server + rutas (`server.js`, `routes/`, `models/`)
- Dashboard React compilado (`dashboard/dist/`)
- Driver de MongoDB (`mongoose`, `mongodb`)
- Wrapper de MongoDB embebido (`mongodb-memory-server`)
- Anthropic SDK + Twilio SDK

## Build en CI/CD

Para builds automatizados en GitHub Actions / GitLab CI:

```yaml
# Ejemplo GitHub Actions
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: npm install
- run: npm run build:dashboard
- run: npx electron-builder --win portable --x64
```

## Troubleshooting

### "wine32 is missing" al construir NSIS

El installer NSIS requiere wine32 (i386). Si solo necesitás el portable, usá `--target portable` (no requiere wine32).

### El .exe abre y cierra rápido

Mirá los logs en `%AppData%/WhatsBot SaaS/app.log`. Generalmente es:
- Antivirus bloqueando MongoDB embebido
- Sin internet en primera ejecución (no puede descargar binario de Mongo)
- Puerto 3137 ocupado por otra app

### MongoDB embebido falla al iniciar

Borrá `%AppData%/WhatsBot SaaS/mongo-data/` y `mongo-binaries/`, luego reabrí la app.
