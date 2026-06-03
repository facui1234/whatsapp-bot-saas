const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');
const { syncOneKb, syncBot } = require('../services/knowledgeSync');
const evolutionApi = require('../services/evolutionApi');

// Validate Argentine phone: 549 + 10 digits = 13 total
const AR_PHONE_RE = /^549\d{10}$/;

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
    const { name, rubric, systemPrompt, faqs, plan } = req.body;
    const bot = new Bot({ name, rubric, systemPrompt, faqs: faqs || [], plan: plan || 'basic' });
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
    const { name, rubric, systemPrompt, faqs, plan, status, knowledgeBases } = req.body;
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });

    if (name !== undefined)         bot.name = name;
    if (rubric !== undefined)       bot.rubric = rubric;
    if (systemPrompt !== undefined) bot.systemPrompt = systemPrompt;
    if (faqs !== undefined)         bot.faqs = faqs;
    if (plan !== undefined)         bot.plan = plan;
    if (status !== undefined)       bot.status = status;

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
    // Try to remove Evolution API instance (best-effort)
    if (bot.evolutionInstanceName) {
      evolutionApi.deleteInstance(bot.evolutionInstanceName).catch(() => {});
    }
    await Conversation.deleteMany({ botId: req.params.id });
    await MessageHistory.deleteMany({ botId: req.params.id });
    res.json({ message: 'Bot eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/pause
router.post('/:id/pause', async (req, res) => {
  try {
    const bot = await Bot.findByIdAndUpdate(req.params.id, { status: 'paused' }, { new: true });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json({ success: true, status: bot.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/resume
router.post('/:id/resume', async (req, res) => {
  try {
    const bot = await Bot.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json({ success: true, status: bot.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bots/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id, { status: 1, phoneNumber: 1, evolutionInstanceName: 1 });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json({ status: bot.status, phoneNumber: bot.phoneNumber, evolutionInstanceName: bot.evolutionInstanceName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/assign-number
router.post('/:id/assign-number', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber es requerido' });

    const clean = String(phoneNumber).replace(/\D/g, '');
    if (!AR_PHONE_RE.test(clean)) {
      return res.status(400).json({ error: 'Número inválido. Formato: 549XXXXXXXXXX (13 dígitos, empieza con 549)' });
    }

    // Check uniqueness
    const conflict = await Bot.findOne({ phoneNumber: clean, _id: { $ne: req.params.id } });
    if (conflict) return res.status(409).json({ error: `El número ${clean} ya está asignado al bot "${conflict.name}"` });

    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });

    // Delete old Evolution instance if number changes
    if (bot.evolutionInstanceName && bot.phoneNumber !== clean) {
      evolutionApi.deleteInstance(bot.evolutionInstanceName).catch(() => {});
    }

    const instanceName = `whatsbot-${bot._id.toString().slice(-10)}`;

    // Create Evolution instance (best-effort: if not configured, just save number)
    let qrData = null;
    try {
      const created = await evolutionApi.createInstance(instanceName);
      qrData = created?.qrcode ?? null;
    } catch (e) {
      console.warn('[assign-number] Evolution API not available:', e.message);
    }

    bot.phoneNumber = clean;
    bot.evolutionInstanceName = instanceName;
    await bot.save();

    res.json({ success: true, phoneNumber: clean, instanceName, qrData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bots/:id/qr
router.get('/:id/qr', async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id, { evolutionInstanceName: 1 });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    if (!bot.evolutionInstanceName) return res.status(400).json({ error: 'Sin instancia configurada' });
    const data = await evolutionApi.getInstanceQr(bot.evolutionInstanceName);
    res.json(data);
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
      .sort({ lastMessageAt: -1 }).limit(50);
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
      bot.faqs = req.body.csv.split('\n').filter(Boolean).map(line => {
        const [q, ...rest] = line.split(',');
        return { question: q?.trim(), answer: rest.join(',').trim() };
      }).filter(f => f.question && f.answer);
    }
    await bot.save();
    res.json({ faqs: bot.faqs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/bots/:id/kb/:kbId/sync
router.post('/:id/kb/:kbId/sync', async (req, res) => {
  try {
    await syncOneKb(req.params.id, req.params.kbId);
    const updated = await Bot.findById(req.params.id, { knowledgeBases: 1 });
    res.json(updated.knowledgeBases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/kb/sync
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
    const bot = await Bot.findByIdAndUpdate(req.params.id, { plan, messageCount: 0 }, { new: true, runValidators: true });
    if (!bot) return res.status(404).json({ error: 'Bot no encontrado' });
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
