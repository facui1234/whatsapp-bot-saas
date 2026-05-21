const Bot = require('../models/Bot');

const MAX_CONTENT = 60000;

function normalizeUrl(raw) {
  const url = raw.trim();
  const docId    = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docId)    return `https://docs.google.com/document/d/${docId[1]}/export?format=txt`;
  const sheetId  = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetId)  return `https://docs.google.com/spreadsheets/d/${sheetId[1]}/export?format=csv`;
  const driveFile= url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFile) return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;
  const driveOpen= url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpen) return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  return url;
}

async function fetchContent(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'WhatsBot-SaaS/1.0 knowledge-sync',
        'Accept': 'text/plain,text/csv,text/html,*/*;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    const cleaned = text.startsWith('<!') || text.startsWith('<html')
      ? text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : text;
    return cleaned.substring(0, MAX_CONTENT);
  } finally {
    clearTimeout(timer);
  }
}

// Sync a single KB entry identified by its subdocument _id
async function syncOneKb(botId, kbId) {
  const bot = await Bot.findById(botId);
  if (!bot) throw new Error('Bot no encontrado');

  const kb = bot.knowledgeBases.find(k => k._id.toString() === kbId.toString());
  if (!kb) throw new Error('KB no encontrada');
  if (!kb.sourceUrl) throw new Error('URL no configurada');

  try {
    const content = await fetchContent(kb.sourceUrl);
    await Bot.findOneAndUpdate(
      { _id: botId, 'knowledgeBases._id': kbId },
      { $set: {
        'knowledgeBases.$.content':     content,
        'knowledgeBases.$.lastFetched': new Date(),
        'knowledgeBases.$.status':      'ok',
        'knowledgeBases.$.lastError':   '',
      }},
    );
    console.log(`[kb-sync] ✓ ${bot.name} / ${kb.name} — ${content.length} chars`);
  } catch (err) {
    await Bot.findOneAndUpdate(
      { _id: botId, 'knowledgeBases._id': kbId },
      { $set: {
        'knowledgeBases.$.status':    'error',
        'knowledgeBases.$.lastError': err.message,
      }},
    );
    console.error(`[kb-sync] ✗ ${bot.name} / ${kb.name} — ${err.message}`);
    throw err;
  }
}

// Sync all enabled KBs for a bot (accepts plain object or Mongoose doc)
async function syncBot(bot) {
  const kbs = (bot.knowledgeBases || []).filter(kb => kb.enabled && kb.sourceUrl);
  for (const kb of kbs) {
    try {
      await syncOneKb(bot._id.toString(), kb._id.toString());
    } catch {} // already logged inside syncOneKb
  }
}

// Global tick — runs every interval
async function syncAll() {
  try {
    const bots = await Bot.find({ 'knowledgeBases.0': { $exists: true } }).lean();
    const active = bots.filter(b => b.knowledgeBases.some(kb => kb.enabled && kb.sourceUrl));
    if (active.length) await Promise.allSettled(active.map(syncBot));
  } catch (err) {
    console.error('[kb-sync] syncAll error:', err.message);
  }
}

let timer = null;

function start(intervalMs = 60_000) {
  if (timer) return;
  syncAll();
  timer = setInterval(syncAll, intervalMs);
  console.log(`[kb-sync] Started — interval ${intervalMs / 1000}s`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, syncBot, syncOneKb, syncAll };
