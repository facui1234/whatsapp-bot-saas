const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Bot = require('../models/Bot');

const COST_PER_TOKEN_REAL = 0.000008;
const MARKUP = 3;
const COST_PER_MESSAGE_TWILIO = 0.005;

async function buildMonthlyReport() {
  const month = new Date().toISOString().substring(0, 7);

  const [clients, bots] = await Promise.all([
    Client.find().lean(),
    Bot.find().lean(),
  ]);

  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.status === 'active').length;

  // Group bots by clientId
  const botsByClient = {};
  for (const bot of bots) {
    const cid = bot.clientId?.toString();
    if (!cid) continue;
    if (!botsByClient[cid]) botsByClient[cid] = [];
    botsByClient[cid].push(bot);
  }

  let totalMessages = 0;
  let totalTokens = 0;
  let totalCostReal = 0;
  let totalCostClient = 0;

  const clientRows = clients.map(client => {
    const clientBots = botsByClient[client._id.toString()] || [];
    const messages = clientBots.reduce((s, b) => s + (b.messageCountThisMonth || 0), 0);
    const tokens = clientBots.reduce((s, b) => s + (b.tokensUsedThisMonth || 0), 0);
    const costReal = tokens * COST_PER_TOKEN_REAL + messages * COST_PER_MESSAGE_TWILIO;
    const costClient = costReal * MARKUP;

    totalMessages += messages;
    totalTokens += tokens;
    totalCostReal += costReal;
    totalCostClient += costClient;

    return {
      clientId: client._id,
      name: client.name,
      plan: client.plan,
      messages,
      tokens,
      costReal,
      costClient,
    };
  });

  // Sort by costClient desc
  clientRows.sort((a, b) => b.costClient - a.costClient);

  return {
    month,
    totalClients,
    activeClients,
    totalMessages,
    totalTokens,
    totalCostReal,
    totalCostClient,
    totalMargin: totalCostClient - totalCostReal,
    clients: clientRows,
  };
}

// GET /monthly — aggregate report across all clients for current month
router.get('/monthly', async (req, res) => {
  try {
    const report = await buildMonthlyReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /monthly/csv — same data exported as CSV
router.get('/monthly/csv', async (req, res) => {
  try {
    const report = await buildMonthlyReport();

    const lines = ['Client,Plan,Messages,Tokens,CostReal,CostClient'];
    for (const c of report.clients) {
      const name = `"${String(c.name).replace(/"/g, '""')}"`;
      lines.push(`${name},${c.plan},${c.messages},${c.tokens},${c.costReal.toFixed(6)},${c.costClient.toFixed(6)}`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.month}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
