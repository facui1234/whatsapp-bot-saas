#!/usr/bin/env bash
# WhatsBot SaaS — Launcher
# Uso: ./start.sh [--prod] [--no-browser]

set -euo pipefail

# ── Colores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
err()  { echo -e "${RED}  ✗${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
info() { echo -e "${CYAN}  →${RESET} $*"; }
step() { echo -e "\n${BOLD}${BLUE}▶ $*${RESET}"; }

# ── Banner ─────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${BLUE}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║      WhatsBot SaaS  —  Launcher      ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${RESET}"

# ── Flags ──────────────────────────────────────────────────────────────────────
PROD_MODE=false
OPEN_BROWSER=true
for arg in "$@"; do
  case "$arg" in
    --prod)       PROD_MODE=true ;;
    --no-browser) OPEN_BROWSER=false ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

# ── PIDs para cleanup ──────────────────────────────────────────────────────────
SERVER_PID=""
DASHBOARD_PID=""
MONGOD_PID=""

cleanup() {
  echo -e "\n${YELLOW}  Cerrando servicios...${RESET}"
  [ -n "$SERVER_PID" ]    && kill "$SERVER_PID"    2>/dev/null && ok "Servidor detenido"
  [ -n "$DASHBOARD_PID" ] && kill "$DASHBOARD_PID" 2>/dev/null && ok "Dashboard detenido"
  [ -n "$MONGOD_PID" ]    && kill "$MONGOD_PID"    2>/dev/null && ok "MongoDB detenido"
  echo -e "${BOLD}  Hasta luego 👋${RESET}\n"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── 1. Node.js ─────────────────────────────────────────────────────────────────
step "Verificando prerequisitos"

if ! command -v node &>/dev/null; then
  err "Node.js no encontrado. Instalá desde https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
ok "Node.js $NODE_VER"

if ! command -v npm &>/dev/null; then
  err "npm no encontrado."
  exit 1
fi
ok "npm $(npm -v)"

# ── 2. .env ────────────────────────────────────────────────────────────────────
step "Configuración del entorno"

if [ ! -f "$ROOT_DIR/.env" ]; then
  warn ".env no encontrado — creando desde .env.example"
  if [ -f "$ROOT_DIR/.env.example" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo ""
    echo -e "${YELLOW}  ┌─────────────────────────────────────────────────┐${RESET}"
    echo -e "${YELLOW}  │  Completá las variables en .env antes de seguir │${RESET}"
    echo -e "${YELLOW}  └─────────────────────────────────────────────────┘${RESET}"
    echo ""
    echo -e "  Archivo: ${BOLD}$ROOT_DIR/.env${RESET}"
    echo ""
    echo "  Variables necesarias:"
    echo "    MONGODB_URI         → URI de MongoDB (local o Atlas)"
    echo "    ANTHROPIC_API_KEY   → sk-ant-..."
    echo "    TWILIO_ACCOUNT_SID  → AC..."
    echo "    TWILIO_AUTH_TOKEN   → token"
    echo "    TWILIO_PHONE_NUMBER → whatsapp:+14155238886"
    echo ""
    read -rp "  ¿Ya editaste el .env? [s/N] " confirm
    [[ "$confirm" =~ ^[sS]$ ]] || { warn "Editá .env y volvé a correr ./start.sh"; exit 0; }
  else
    err ".env.example no encontrado"
    exit 1
  fi
fi
ok ".env encontrado"

# Cargar .env para verificar vars
set -a; source "$ROOT_DIR/.env"; set +a

check_env() {
  if [ -z "${!1:-}" ]; then warn "$1 no configurado en .env"; else ok "$1 ✓"; fi
}
check_env ANTHROPIC_API_KEY
check_env TWILIO_ACCOUNT_SID
check_env MONGODB_URI

# ── 3. MongoDB ─────────────────────────────────────────────────────────────────
step "MongoDB"

MONGODB_URI_VAL="${MONGODB_URI:-mongodb://localhost:27017/whatsapp-bot-saas}"

# Detectar si es Atlas (remoto)
if echo "$MONGODB_URI_VAL" | grep -q "mongodb+srv"; then
  ok "Usando MongoDB Atlas (remoto)"
else
  # Local: verificar si ya está corriendo
  if command -v mongod &>/dev/null; then
    if ! pgrep -x mongod &>/dev/null; then
      info "Iniciando MongoDB local..."
      MONGO_DATA_DIR="$ROOT_DIR/.mongo-data"
      mkdir -p "$MONGO_DATA_DIR"
      mongod --dbpath "$MONGO_DATA_DIR" --logpath "$LOG_DIR/mongo.log" --fork --quiet &>/dev/null && \
        { MONGOD_PID=$!; ok "MongoDB iniciado (PID $MONGOD_PID)"; } || \
        warn "No se pudo iniciar mongod. Asegurate de que MongoDB esté corriendo."
    else
      ok "MongoDB ya está corriendo"
    fi
  else
    warn "mongod no encontrado. Asegurate de que MongoDB esté corriendo o usá Atlas."
  fi
fi

# ── 4. Dependencias del servidor ───────────────────────────────────────────────
step "Dependencias del servidor"
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  info "Instalando dependencias del servidor..."
  cd "$ROOT_DIR" && npm install --silent 2>>"$LOG_DIR/npm-server.log"
  ok "Dependencias del servidor instaladas"
else
  ok "node_modules del servidor encontrado"
fi

# ── 5. Dependencias del dashboard ─────────────────────────────────────────────
step "Dashboard"
if [ ! -d "$ROOT_DIR/dashboard/node_modules" ]; then
  info "Instalando dependencias del dashboard..."
  cd "$ROOT_DIR/dashboard" && npm install --silent 2>>"$LOG_DIR/npm-dashboard.log"
  ok "Dependencias del dashboard instaladas"
else
  ok "node_modules del dashboard encontrado"
fi

# ── 6. Modo producción: build ─────────────────────────────────────────────────
if $PROD_MODE; then
  step "Build de producción"
  info "Compilando dashboard..."
  cd "$ROOT_DIR/dashboard" && npm run build --silent 2>>"$LOG_DIR/build.log"
  ok "Dashboard compilado en dashboard/dist/"
  export NODE_ENV=production
fi

# ── 7. Iniciar servidor ────────────────────────────────────────────────────────
step "Iniciando servicios"

SERVER_PORT="${PORT:-3000}"
cd "$ROOT_DIR"

if $PROD_MODE; then
  info "Iniciando servidor en modo producción (puerto $SERVER_PORT)..."
  node server.js >> "$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
else
  if command -v npx &>/dev/null; then
    info "Iniciando servidor con nodemon (puerto $SERVER_PORT)..."
    npx nodemon server.js >> "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
  else
    info "Iniciando servidor con node (puerto $SERVER_PORT)..."
    node server.js >> "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
  fi
fi

# Esperar a que el servidor levante
TIMEOUT=15
READY=false
for i in $(seq 1 $TIMEOUT); do
  sleep 1
  if curl -s "http://localhost:$SERVER_PORT/health" &>/dev/null; then
    READY=true
    break
  fi
done

if $READY; then
  ok "Servidor corriendo en http://localhost:$SERVER_PORT (PID $SERVER_PID)"
else
  err "El servidor no respondió en $TIMEOUT segundos. Revisá $LOG_DIR/server.log"
  tail -20 "$LOG_DIR/server.log" 2>/dev/null | sed 's/^/    /'
fi

# ── 8. Iniciar dashboard ───────────────────────────────────────────────────────
DASHBOARD_PORT=5173
DASHBOARD_URL="http://localhost:$DASHBOARD_PORT"

if ! $PROD_MODE; then
  info "Iniciando dashboard Vite (puerto $DASHBOARD_PORT)..."
  cd "$ROOT_DIR/dashboard" && npm run dev -- --port $DASHBOARD_PORT >> "$LOG_DIR/dashboard.log" 2>&1 &
  DASHBOARD_PID=$!

  # Esperar a que levante
  READY=false
  for i in $(seq 1 15); do
    sleep 1
    if curl -s "$DASHBOARD_URL" &>/dev/null; then
      READY=true
      break
    fi
  done

  if $READY; then
    ok "Dashboard en $DASHBOARD_URL (PID $DASHBOARD_PID)"
  else
    warn "Dashboard tardando en responder. Puede que aún esté iniciando..."
  fi
else
  DASHBOARD_URL="http://localhost:$SERVER_PORT"
  ok "Dashboard servido desde el servidor en $DASHBOARD_URL"
fi

# ── 9. Abrir browser ───────────────────────────────────────────────────────────
if $OPEN_BROWSER; then
  sleep 1
  if command -v xdg-open &>/dev/null; then
    xdg-open "$DASHBOARD_URL" &>/dev/null &
  elif command -v open &>/dev/null; then
    open "$DASHBOARD_URL"
  elif command -v wslview &>/dev/null; then
    wslview "$DASHBOARD_URL"
  fi
fi

# ── 10. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✅ Sistema iniciado correctamente${RESET}"
echo ""
echo -e "  ${BOLD}Dashboard:${RESET}  $DASHBOARD_URL"
echo -e "  ${BOLD}API:${RESET}        http://localhost:$SERVER_PORT/api"
echo -e "  ${BOLD}Webhook:${RESET}    http://localhost:$SERVER_PORT/webhook/whatsapp"
echo -e "  ${BOLD}Health:${RESET}     http://localhost:$SERVER_PORT/health"
echo ""
echo -e "  ${BOLD}Logs en tiempo real:${RESET}"
echo -e "    Servidor:   $LOG_DIR/server.log"
echo -e "    Dashboard:  $LOG_DIR/dashboard.log"
echo ""
echo -e "  ${YELLOW}Presioná Ctrl+C para detener todo${RESET}"
echo ""

# ── 11. Tail logs en la terminal ───────────────────────────────────────────────
echo -e "${BOLD}${BLUE}── Logs del servidor ─────────────────────────────────────────${RESET}"
tail -f "$LOG_DIR/server.log" &
TAIL_PID=$!

# Esperar señal
wait $SERVER_PID 2>/dev/null || true
kill $TAIL_PID 2>/dev/null || true
cleanup
