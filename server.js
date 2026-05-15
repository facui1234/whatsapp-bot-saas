require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');

const botsRouter = require('./routes/bots');
const webhookRouter = require('./routes/webhook');
const templatesRouter = require('./routes/templates');

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
app.use('/webhook', webhookRouter);

// Serve dashboard in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dashboard/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard/dist/index.html'));
  });
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot-saas')
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
