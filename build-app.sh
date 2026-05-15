#!/usr/bin/env bash
# WhatsBot SaaS — Build script
# Genera el ejecutable de escritorio (.exe portable para Windows)
# Uso: ./build-app.sh [portable|installer|both]

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
err()  { echo -e "${RED}  ✗${RESET} $*"; }
info() { echo -e "${CYAN}  →${RESET} $*"; }
step() { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

TARGET="${1:-portable}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

clear
echo -e "${BOLD}${BLUE}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   WhatsBot SaaS  —  Build de ejecutable   ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${RESET}"

step "Verificando dependencias"
if [ ! -d node_modules/electron ]; then
  info "Instalando dependencias..."
  npm install
fi
ok "Dependencias listas"

step "Compilando dashboard (Vite)"
npm run build:dashboard
ok "Dashboard compilado en dashboard/dist/"

step "Empaquetando aplicación Electron"
info "Target: $TARGET · Plataforma: Windows x64"

case "$TARGET" in
  portable)
    info "Generando portable (.exe single-file)..."
    if command -v xvfb-run &>/dev/null && [ -z "${DISPLAY:-}" ]; then
      xvfb-run --auto-servernum npx electron-builder --win portable --x64
    else
      npx electron-builder --win portable --x64
    fi
    ;;
  installer)
    info "Generando installer NSIS..."
    if command -v xvfb-run &>/dev/null && [ -z "${DISPLAY:-}" ]; then
      xvfb-run --auto-servernum npx electron-builder --win nsis --x64
    else
      npx electron-builder --win nsis --x64
    fi
    ;;
  both)
    info "Generando portable + NSIS..."
    if command -v xvfb-run &>/dev/null && [ -z "${DISPLAY:-}" ]; then
      xvfb-run --auto-servernum npx electron-builder --win --x64
    else
      npx electron-builder --win --x64
    fi
    ;;
  *)
    err "Target desconocido: $TARGET"
    echo "  Uso: ./build-app.sh [portable|installer|both]"
    exit 1
    ;;
esac

step "Build completado"
echo ""
ls -lh "$ROOT_DIR/release/" | grep -E "\.(exe|zip)" || true
echo ""
ok "Artefactos en: $ROOT_DIR/release/"
echo ""
echo -e "  ${BOLD}Cómo usar:${RESET}"
echo -e "    1. Copiá el .exe a una PC Windows"
echo -e "    2. Hacé doble click — la app se abre con MongoDB embebido"
echo -e "    3. Configurá tu Anthropic API key en Archivo → Configuración"
echo -e "    4. Empezá a crear bots desde el dashboard"
echo ""
