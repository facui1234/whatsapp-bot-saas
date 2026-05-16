const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');

const COST_PER_TOKEN_REAL = 0.000008; // $8 per 1M tokens
const MARKUP = 3;
const COST_PER_MESSAGE_TWILIO = 0.005;

// Validate email format
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// GET / — list clients with filters, pagination, and per-client bot metrics
router.get('/', async (req, res) => {
  try {
    const { plan, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (plan) filter.plan = plan;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [clients, total] = await Promise.all([
      Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Client.countDocuments(filter),
    ]);

    // Join bots metrics for each client
    const clientIds = clients.map(c => c._id);
    const bots = await Bot.find({ clientId: { $in: clientIds } }).lean();

    const botsByClient = {};
    for (const bot of bots) {
      const cid = bot.clientId?.toString();
      if (!cid) continue;
      if (!botsByClient[cid]) botsByClient[cid] = [];
      botsByClient[cid].push(bot);
    }

    const enriched = clients.map(client => {
      const clientBots = botsByClient[client._id.toString()] || [];
      const botsCount = clientBots.length;
      const messagesThisMonth = clientBots.reduce((s, b) => s + (b.messageCountThisMonth || 0), 0);
      const tokensThisMonth = clientBots.reduce((s, b) => s + (b.tokensUsedThisMonth || 0), 0);
      const costThisMonthReal = tokensThisMonth * COST_PER_TOKEN_REAL + messagesThisMonth * COST_PER_MESSAGE_TWILIO;
      const costThisMonth = costThisMonthReal * MARKUP;
      return { ...client, botsCount, messagesThisMonth, tokensThisMonth, costThisMonth };
    });

    res.json({
      clients: enriched,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create client
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, rubric, plan, monthlyBudget, notes } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!rubric) return res.status(400).json({ error: 'Rubric is required' });

    const client = new Client({ name, email, phone, rubric, plan, monthlyBudget, notes });
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — client details + bots with per-bot metrics
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const bots = await Bot.find({ clientId: client._id }).lean();
    const enrichedBots = bots.map(bot => {
      const costReal = (bot.tokensUsedThisMonth || 0) * COST_PER_TOKEN_REAL
        + (bot.messageCountThisMonth || 0) * COST_PER_MESSAGE_TWILIO;
      return { ...bot, costThisMonthReal: costReal, costThisMonth: costReal * MARKUP };
    });

    res.json({ ...client, bots: enrichedBots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update any field
router.put('/:id', async (req, res) => {
  try {
    const { email } = req.body;
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete client, their bots, conversations, and message history
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const bots = await Bot.find({ clientId: client._id }).lean();
    const botIds = bots.map(b => b._id);

    await Promise.all([
      MessageHistory.deleteMany({ botId: { $in: botIds } }),
      Conversation.deleteMany({ botId: { $in: botIds } }),
      Bot.deleteMany({ clientId: client._id }),
      Invoice.deleteMany({ clientId: client._id }),
      Client.findByIdAndDelete(client._id),
    ]);

    res.json({ message: 'Client and all associated data deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/bots — list bots for this client with monthly metrics
router.get('/:id/bots', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const bots = await Bot.find({ clientId: client._id }).lean();
    const enriched = bots.map(bot => {
      const costReal = (bot.tokensUsedThisMonth || 0) * COST_PER_TOKEN_REAL
        + (bot.messageCountThisMonth || 0) * COST_PER_MESSAGE_TWILIO;
      return { ...bot, costThisMonthReal: costReal, costThisMonth: costReal * MARKUP };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/invoices — list invoices sorted by month desc
router.get('/:id/invoices', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const invoices = await Invoice.find({ clientId: client._id }).sort({ month: -1 }).lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/invoice/generate — generate/update invoice for current month
router.post('/:id/invoice/generate', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const currentMonth = new Date().toISOString().substring(0, 7);
    const bots = await Bot.find({ clientId: client._id }).lean();

    let totalMessages = 0;
    let totalTokens = 0;
    let totalCostReal = 0;
    let totalCostClient = 0;

    const botBreakdown = bots.map(bot => {
      const messages = bot.messageCountThisMonth || 0;
      const tokens = bot.tokensUsedThisMonth || 0;
      const costReal = tokens * COST_PER_TOKEN_REAL + messages * COST_PER_MESSAGE_TWILIO;
      const costClient = costReal * MARKUP;

      totalMessages += messages;
      totalTokens += tokens;
      totalCostReal += costReal;
      totalCostClient += costClient;

      return {
        botId: bot._id,
        botName: bot.name,
        messages,
        tokens,
        costReal,
        costClient,
      };
    });

    const invoice = await Invoice.findOneAndUpdate(
      { clientId: client._id, month: currentMonth },
      {
        $set: {
          totalMessages,
          totalTokens,
          totalCostReal,
          totalCostClient,
          bots: botBreakdown,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await Client.findByIdAndUpdate(client._id, { lastInvoiceDate: new Date() });

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/invoice/:invoiceId/status — update invoice status
router.put('/:id/invoice/:invoiceId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'paid', 'overdue'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const update = { status };
    if (status === 'sent') update.sentDate = new Date();
    if (status === 'paid') update.paidDate = new Date();

    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.invoiceId, clientId: req.params.id },
      { $set: update },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/plan — update plan and reset monthly counters on all client's bots
router.put('/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['basic', 'pro', 'enterprise'];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ error: `Plan must be one of: ${validPlans.join(', ')}` });
    }

    const [client] = await Promise.all([
      Client.findByIdAndUpdate(req.params.id, { $set: { plan } }, { new: true }),
      Bot.updateMany(
        { clientId: req.params.id },
        { $set: { plan, messageCountThisMonth: 0, tokensUsedThisMonth: 0 } }
      ),
    ]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/reset-month — reset monthly counters on all client's bots
router.post('/:id/reset-month', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const result = await Bot.updateMany(
      { clientId: client._id },
      { $set: { messageCountThisMonth: 0, tokensUsedThisMonth: 0 } }
    );

    res.json({ message: 'Monthly counters reset', botsUpdated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
