const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const mongoose = require('mongoose');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/admin/health — detailed system status
router.get('/health', async (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    mongodb: { ok: false, state: 'unknown' },
    claude: { ok: false, configured: false },
    twilio: { ok: false, configured: false },
    env: {},
  };

  // MongoDB
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = mongoose.connection.readyState;
  status.mongodb = { ok: state === 1, state: states[state] || 'unknown' };

  // Claude API
  status.claude.configured = Boolean(process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant-'));
  if (status.claude.configured) {
    try {
      await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }],
      });
      status.claude.ok = true;
    } catch (e) {
      status.claude.ok = false;
      status.claude.error = e.message?.slice(0, 80);
    }
  }

  // Twilio
  status.twilio.configured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
  status.twilio.ok = status.twilio.configured;

  // Env vars presence check
  const requiredVars = ['MONGODB_URI', 'ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
  requiredVars.forEach(v => { status.env[v] = Boolean(process.env[v]); });

  res.json(status);
});

// GET /api/admin/stats — global platform statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalBots, activeBots, totalMessages, totalConversations] = await Promise.all([
      Bot.countDocuments(),
      Bot.countDocuments({ active: true }),
      MessageHistory.countDocuments(),
      Conversation.countDocuments(),
    ]);

    const msgByBot = await MessageHistory.aggregate([
      { $group: { _id: '$botId', count: { $sum: 1 }, tokens: { $sum: '$tokensUsed' }, avgTime: { $avg: '$processingTime' } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const last24h = await MessageHistory.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 86400000) },
    });

    const errors24h = await MessageHistory.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 86400000) },
      error: { $exists: true, $ne: null },
    });

    res.json({ totalBots, activeBots, totalMessages, totalConversations, last24h, errors24h, msgByBot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/logs — recent activity across all bots
router.get('/logs', async (req, res) => {
  try {
    const { limit = 30, onlyErrors } = req.query;
    const filter = onlyErrors === 'true' ? { error: { $exists: true, $ne: null } } : {};
    const logs = await MessageHistory.find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate('botId', 'name');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/bots/:id/test — test a bot with Claude directly (no Twilio, no counters)
router.post('/bots/:id/test', async (req, res) => {
  const startTime = Date.now();
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });

    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });

    let systemPrompt = bot.systemPrompt;
    if (bot.faqs?.length) {
      systemPrompt += '\n\n--- PREGUNTAS FRECUENTES ---\n';
      bot.faqs.forEach(f => { systemPrompt += `P: ${f.question}\nR: ${f.answer}\n\n`; });
    }

    const claudeMessages = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const replyText = response.content[0]?.text ?? '';
    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    res.json({
      response: replyText,
      tokensUsed,
      processingTime: Date.now() - startTime,
      model: response.model,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, processingTime: Date.now() - startTime });
  }
});

// DELETE /api/admin/bots/:id/reset — reset message counter
router.delete('/bots/:id/reset', async (req, res) => {
  try {
    const bot = await Bot.findByIdAndUpdate(req.params.id, { messageCount: 0 }, { new: true });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json({ message: 'Contador reseteado', bot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/bots/:id/conversations — clear conversation history
router.delete('/bots/:id/conversations', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    const { deletedCount } = await Conversation.deleteMany({ botId: req.params.id });
    res.json({ message: `${deletedCount} conversaciones eliminadas` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
