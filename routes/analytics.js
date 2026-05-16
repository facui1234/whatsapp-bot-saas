const express = require('express');
const router = express.Router();
const MessageLog = require('../models/MessageLog');
const Bot = require('../models/Bot');

const ES_STOPWORDS = new Set([
  'de','la','el','que','en','y','a','los','del','se','las','un','por','con','una',
  'su','para','es','al','lo','como','más','pero','sus','le','ya','o','este','sí',
  'porque','esta','entre','cuando','muy','sin','sobre','también','me','hasta',
  'hay','donde','quien','desde','todo','nos','durante','todos','uno','les','ni',
  'contra','otros','ese','eso','ante','ellos','e','esto','mí','antes','algunos',
  'qué','unos','yo','otro','otras','él','tanto','esa','estos','mucho','quienes',
  'nada','muchos','cual','poco','ella','estar','haber','hace','tener','ser','fue',
  'son','está','ha','si','no','te','mi','tu','hola','gracias','buenas','ok','okay',
  'claro','bueno','bien','favor','por','quiero','necesito','tengo','tenemos',
]);

function buildMatch(query) {
  const match = {};
  if (query.botId) match.botId = require('mongoose').Types.ObjectId.createFromHexString(query.botId);
  if (query.clientId) match.clientId = require('mongoose').Types.ObjectId.createFromHexString(query.clientId);
  if (query.from || query.to) {
    match.timestamp = {};
    if (query.from) match.timestamp.$gte = new Date(query.from);
    if (query.to)   match.timestamp.$lte = new Date(query.to);
  }
  return match;
}

// GET /analytics/summary
router.get('/summary', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const [result] = await MessageLog.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        totalTokens:   { $sum: '$tokensUsed' },
        uniqueUsers:   { $addToSet: '$senderNumber' },
        uniqueDates:   { $addToSet: '$date' },
      }},
      { $project: {
        _id: 0,
        totalMessages: 1,
        totalTokens: 1,
        uniqueUsers:  { $size: '$uniqueUsers' },
        activeDays:   { $size: '$uniqueDates' },
      }},
    ]);
    res.json(result ?? { totalMessages: 0, totalTokens: 0, uniqueUsers: 0, activeDays: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics/hours
router.get('/hours', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const raw = await MessageLog.aggregate([
      { $match: match },
      { $group: { _id: '$hour', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    // Fill all 24 hours
    const map = Object.fromEntries(raw.map(r => [r._id, r.count]));
    const data = Array.from({ length: 24 }, (_, h) => ({ hour: h, messages: map[h] ?? 0 }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics/days
router.get('/days', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const raw = await MessageLog.aggregate([
      { $match: match },
      { $group: { _id: '$dayOfWeek', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const map = Object.fromEntries(raw.map(r => [r._id, r.count]));
    const data = Array.from({ length: 7 }, (_, d) => ({ day: DAYS[d], dayIndex: d, messages: map[d] ?? 0 }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics/daily  – messages per calendar date (last N days trend)
router.get('/daily', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const limit = Math.min(parseInt(req.query.days ?? 30), 90);
    if (!match.timestamp) {
      const from = new Date(); from.setDate(from.getDate() - limit);
      match.timestamp = { $gte: from };
    }
    const raw = await MessageLog.aggregate([
      { $match: match },
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(raw.map(r => ({ date: r._id, messages: r.count })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics/keywords  – top words mentioned in messages
router.get('/keywords', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const top = parseInt(req.query.top ?? 15);
    const docs = await MessageLog.find(match, { messageText: 1 }).limit(2000).lean();

    const freq = {};
    for (const doc of docs) {
      if (!doc.messageText) continue;
      const words = doc.messageText
        .toLowerCase()
        .replace(/[^a-záéíóúüñ\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !ES_STOPWORDS.has(w));
      for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
    }
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([word, count]) => ({ word, count }));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics/bots  – per-bot breakdown
router.get('/bots', async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const raw = await MessageLog.aggregate([
      { $match: match },
      { $group: {
        _id: '$botId',
        messages: { $sum: 1 },
        tokens:   { $sum: '$tokensUsed' },
        users:    { $addToSet: '$senderNumber' },
      }},
      { $lookup: { from: 'bots', localField: '_id', foreignField: '_id', as: 'bot' } },
      { $unwind: { path: '$bot', preserveNullAndEmpty: false } },
      { $project: { _id: 0, botId: '$_id', name: '$bot.name', messages: 1, tokens: 1, users: { $size: '$users' } } },
      { $sort: { messages: -1 } },
    ]);
    res.json(raw);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
