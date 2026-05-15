const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Electron context marker (used by server.js to enable static serving)
process.env.ELECTRON_APP = '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Where the user's data lives (separate from app bundle so updates don't wipe it)
const userDataDir = app.getPath('userData');
const mongoDataDir = path.join(userDataDir, 'mongo-data');
const settingsFile = path.join(userDataDir, 'settings.json');
const logFile = path.join(userDataDir, 'app.log');

fs.mkdirSync(mongoDataDir, { recursive: true });

// Tee console output to log file so users can send it if something breaks
function tee(stream, level) {
  const orig = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${chunk}`); } catch {}
    return orig(chunk, ...rest);
  };
}
tee(process.stdout, 'INFO');
tee(process.stderr, 'ERROR');

console.log(`Booting WhatsBot SaaS — userData: ${userDataDir}`);

// ── Settings persistence ──────────────────────────────────────────────────────
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile, 'utf-8')); }
  catch { return {}; }
}
function saveSettings(s) {
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
}

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let mongod = null;
let httpServer = null;
const PORT = 3137; // Custom port to avoid clashes with common ports

// ── Splash window ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480, height: 320,
    frame: false, resizable: false, alwaysOnTop: true,
    transparent: false, show: false,
    backgroundColor: '#111827',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

function updateSplash(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(text)};`
    ).catch(() => {});
  }
  console.log(`[splash] ${text}`);
}

// ── MongoDB embebido ─────────────────────────────────────────────────────────
async function startEmbeddedMongo() {
  updateSplash('Iniciando base de datos local...');
  const { MongoMemoryServer } = require('mongodb-memory-server');

  mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'whatsapp-bot-saas',
      dbPath: mongoDataDir,
      storageEngine: 'wiredTiger',
      port: 27117,
    },
    binary: {
      // Use a stable LTS version; binary cached in userData on first launch
      version: '7.0.14',
      downloadDir: path.join(userDataDir, 'mongo-binaries'),
    },
  });

  const uri = mongod.getUri();
  console.log('MongoDB embebido listo:', uri);
  return uri;
}

// ── Start Express server ──────────────────────────────────────────────────────
async function startBackendServer() {
  const settings = loadSettings();

  // Inject env vars from saved settings (user can set these via Settings window)
  if (settings.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY;
  if (settings.TWILIO_ACCOUNT_SID) process.env.TWILIO_ACCOUNT_SID = settings.TWILIO_ACCOUNT_SID;
  if (settings.TWILIO_AUTH_TOKEN) process.env.TWILIO_AUTH_TOKEN = settings.TWILIO_AUTH_TOKEN;
  if (settings.TWILIO_PHONE_NUMBER) process.env.TWILIO_PHONE_NUMBER = settings.TWILIO_PHONE_NUMBER;

  process.env.PORT = String(PORT);
  process.env.DASHBOARD_DIST = path.join(getResourcePath(), 'dashboard', 'dist');

  updateSplash('Iniciando servidor backend...');
  // Require server lazily so env vars are set before it loads
  const server = require(path.join(getResourcePath(), 'server.js'));
  httpServer = await server.start();
  console.log(`Servidor escuchando en puerto ${PORT}`);
}

// In packaged app, source files live in resources/app or asar; in dev, project root
function getResourcePath() {
  if (app.isPackaged) {
    // electron-builder unpacks to resources/app.asar.unpacked when asarUnpack is set,
    // otherwise resources/app or app.asar. Try common locations.
    const candidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked'),
      path.join(process.resourcesPath, 'app'),
      path.join(process.resourcesPath),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'server.js'))) return c;
    }
  }
  return path.join(__dirname, '..');
}

// ── Main window ───────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#f9fafb',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'WhatsBot SaaS',
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://localhost:${PORT}/login`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Configuración de API keys...',
          accelerator: 'CmdOrCtrl+,',
          click: openSettingsWindow,
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño normal' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Abrir carpeta de datos',
          click: () => shell.openPath(userDataDir),
        },
        {
          label: 'Ver log de la app',
          click: () => shell.openPath(logFile),
        },
        { type: 'separator' },
        {
          label: 'Acerca de WhatsBot SaaS',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'WhatsBot SaaS',
              message: 'WhatsBot SaaS',
              detail: `Versión ${app.getVersion()}\n\nPlataforma de gestión de bots de WhatsApp con IA.\nMongoDB embebido · Claude AI · Twilio`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Settings window ───────────────────────────────────────────────────────────
function openSettingsWindow() {
  const settingsWin = new BrowserWindow({
    width: 560, height: 600,
    resizable: false, parent: mainWindow, modal: true,
    title: 'Configuración',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_, data) => {
  saveSettings(data);
  // Hot-reload env so changes take effect without restart
  if (data.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = data.ANTHROPIC_API_KEY;
  if (data.TWILIO_ACCOUNT_SID) process.env.TWILIO_ACCOUNT_SID = data.TWILIO_ACCOUNT_SID;
  if (data.TWILIO_AUTH_TOKEN) process.env.TWILIO_AUTH_TOKEN = data.TWILIO_AUTH_TOKEN;
  if (data.TWILIO_PHONE_NUMBER) process.env.TWILIO_PHONE_NUMBER = data.TWILIO_PHONE_NUMBER;
  return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
async function boot() {
  try {
    createSplash();

    updateSplash('Preparando MongoDB embebido...');
    const uri = await startEmbeddedMongo();
    process.env.MONGODB_URI = uri;

    await startBackendServer();

    updateSplash('Cargando dashboard...');
    createMainWindow();
    buildMenu();

    // First-launch check: if no API keys configured, open settings window
    const s = loadSettings();
    if (!s.ANTHROPIC_API_KEY) {
      setTimeout(openSettingsWindow, 1500);
    }
  } catch (err) {
    console.error('Boot error:', err);
    dialog.showErrorBox(
      'Error al iniciar',
      `No se pudo iniciar WhatsBot SaaS.\n\n${err.message}\n\nRevisá el log en:\n${logFile}`
    );
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('window-all-closed', async () => {
  await cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (httpServer || mongod) {
    e.preventDefault();
    await cleanup();
    app.exit(0);
  }
});

async function cleanup() {
  try {
    if (httpServer) { httpServer.close(); httpServer = null; }
    if (mongod) { await mongod.stop(); mongod = null; }
  } catch (e) { console.error('Cleanup error:', e); }
}
