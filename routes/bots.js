const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');
const { syncOneKb, syncBot } = require('../services/knowledgeSync');

// GET /api/bots
router.get('/', async (req, res) => {
  try {
    const bots = await Bot.find().sort({ createdAt: -1 });
    res.json(bots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots
router.post('/', async (req, res) => {
  try {
    const { name, twilioNumber, rubric, systemPrompt, faqs, plan } = req.body;
    const bot = new Bot({ name, twilioNumber, rubric, systemPrompt, faqs: faqs || [], plan: plan || 'basic' });
    await bot.save();
    res.status(201).json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/bots/:id
router.get('/:id', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json(bot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bots/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, twilioNumber, rubric, systemPrompt, faqs, plan, active, knowledgeBases } = req.body;
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });

    Object.assign(bot, { name, twilioNumber, rubric, systemPrompt, faqs, plan, active });

    // Merge incoming knowledgeBases with existing ones (preserve cached content when URL unchanged)
    if (Array.isArray(knowledgeBases)) {
      const existingMap = new Map(bot.knowledgeBases.map(kb => [kb._id.toString(), kb]));
      bot.knowledgeBases = knowledgeBases.map(incoming => {
        const existing = incoming._id ? existingMap.get(String(incoming._id)) : null;
        const urlChanged = existing && existing.sourceUrl !== incoming.sourceUrl;
        return {
          _id:                    existing?._id,
          name:                   incoming.name || 'Base de conocimiento',
          enabled:                incoming.enabled ?? true,
          sourceUrl:              incoming.sourceUrl || '',
          refreshIntervalMinutes: incoming.refreshIntervalMinutes ?? 1,
          content:     (existing && !urlChanged) ? existing.content     : '',
          lastFetched: (existing && !urlChanged) ? existing.lastFetched : null,
          lastError:   (existing && !urlChanged) ? existing.lastError   : '',
          status:      (existing && !urlChanged) ? existing.status      : 'idle',
        };
      });
    }

    await bot.save();
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/bots/:id
router.delete('/:id', async (req, res) => {
  try {
    const bot = await Bot.findByIdAndDelete(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    await Conversation.deleteMany({ botId: req.params.id });
    await MessageHistory.deleteMany({ botId: req.params.id });
    res.json({ message: 'Bot eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bots/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, sender } = req.query;
    const filter = { botId: req.params.id };
    if (sender) filter.senderNumber = sender;
    const total = await MessageHistory.countDocuments(filter);
    const history = await MessageHistory.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ history, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bots/:id/conversations
router.get('/:id/conversations', async (req, res) => {
  try {
    const conversations = await Conversation.find({ botId: req.params.id })
      .sort({ lastMessageAt: -1 })
      .limit(50);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/faqs
router.post('/:id/faqs', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    if (Array.isArray(req.body.faqs)) {
      bot.faqs = req.body.faqs;
    } else if (req.body.csv) {
      const lines = req.body.csv.split('\n').filter(Boolean);
      bot.faqs = lines.map(line => {
        const [question, ...rest] = line.split(',');
        return { question: question?.trim(), answer: rest.join(',').trim() };
      }).filter(f => f.question && f.answer);
    }
    await bot.save();
    res.json({ faqs: bot.faqs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/bots/:id/kb/:kbId/sync  — sync one KB
router.post('/:id/kb/:kbId/sync', async (req, res) => {
  try {
    await syncOneKb(req.params.id, req.params.kbId);
    const updated = await Bot.findById(req.params.id, { knowledgeBases: 1 });
    res.json(updated.knowledgeBases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/kb/sync  — sync all KBs for this bot
router.post('/:id/kb/sync', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    await syncBot(bot);
    const updated = await Bot.findById(req.params.id, { knowledgeBases: 1 });
    res.json(updated.knowledgeBases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bots/:id/plan
router.put('/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    const bot = await Bot.findByIdAndUpdate(
      req.params.id,
      { plan, messageCount: 0 },
      { new: true, runValidators: true }
    );
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
