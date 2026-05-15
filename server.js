require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');

const botsRouter = require('./routes/bots');
const webhookRouter = require('./routes/webhook');
const templatesRouter = require('./routes/templates');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.DASHBOARD_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } }));

// API Routes
app.use('/api/bots', botsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/admin', adminRouter);
app.use('/webhook', webhookRouter);

// Serve dashboard in production or Electron
const distPath = process.env.DASHBOARD_DIST || path.join(__dirname, 'dashboard/dist');
if (process.env.NODE_ENV === 'production' || process.env.ELECTRON_APP === '1') {
  app.use(express.static(distPath));
  app.get(/^\/(?!api|webhook|health).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Boot helper used both by CLI and Electron
async function start() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot-saas';
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB connected');

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

async function stop() {
  try { await mongoose.disconnect(); } catch {}
}

// Auto-start only when run directly (not when required by Electron)
if (require.main === module) {
  start().catch(err => {
    console.error('❌ Boot failed:', err.message);
    process.exit(1);
  });
}

module.exports = { app, start, stop };
