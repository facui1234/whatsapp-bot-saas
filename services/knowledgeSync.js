const Bot = require('../models/Bot');

const MAX_CONTENT = 60000; // ~60k chars — safe for Claude context

function normalizeUrl(raw) {
  const url = raw.trim();

  // Google Docs → plain-text export
  const docId = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docId) return `https://docs.google.com/document/d/${docId[1]}/export?format=txt`;

  // Google Sheets → CSV export
  const sheetId = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetId) return `https://docs.google.com/spreadsheets/d/${sheetId[1]}/export?format=csv`;

  // Google Drive file-view → direct download
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFile) return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;

  // Google Drive open/?id=
  const driveOpen = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpen) return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;

  // SharePoint / OneDrive "download" links — pass through as-is
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
    // Strip HTML tags if the response looks like HTML
    const cleaned = text.startsWith('<!') || text.startsWith('<html')
      ? text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : text;
    return cleaned.substring(0, MAX_CONTENT);
  } finally {
    clearTimeout(timer);
  }
}

async function syncBot(bot) {
  if (!bot.knowledgeBase?.enabled || !bot.knowledgeBase?.sourceUrl) return;
  try {
    const content = await fetchContent(bot.knowledgeBase.sourceUrl);
    await Bot.findByIdAndUpdate(bot._id, {
      'knowledgeBase.content':     content,
      'knowledgeBase.lastFetched': new Date(),
      'knowledgeBase.status':      'ok',
      'knowledgeBase.lastError':   '',
    });
    console.log(`[kb-sync] ✓ ${bot.name} — ${content.length} chars`);
  } catch (err) {
    await Bot.findByIdAndUpdate(bot._id, {
      'knowledgeBase.status':    'error',
      'knowledgeBase.lastError': err.message,
    });
    console.error(`[kb-sync] ✗ ${bot.name} — ${err.message}`);
  }
}

async function syncAll() {
  try {
    const bots = await Bot.find({
      'knowledgeBase.enabled':   true,
      'knowledgeBase.sourceUrl': { $nin: ['', null] },
    }).lean();
    if (bots.length) await Promise.allSettled(bots.map(syncBot));
  } catch (err) {
    console.error('[kb-sync] syncAll error:', err.message);
  }
}

let timer = null;

function start(intervalMs = 60_000) {
  if (timer) return;
  syncAll(); // immediate first run
  timer = setInterval(syncAll, intervalMs);
  console.log(`[kb-sync] Started — interval ${intervalMs / 1000}s`);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, syncBot, syncAll };
