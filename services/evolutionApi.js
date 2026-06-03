// Wrapper for Evolution API (self-hosted WhatsApp gateway)

function getConfig() {
  const baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey  = process.env.EVOLUTION_API_KEY || '';
  if (!baseUrl) throw new Error('EVOLUTION_API_URL no configurada en ajustes');
  if (!apiKey)  throw new Error('EVOLUTION_API_KEY no configurada en ajustes');
  return { baseUrl, apiKey };
}

async function request(method, path, body) {
  const { baseUrl, apiKey } = getConfig();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution API ${res.status}: ${text.substring(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

// Create a new WhatsApp instance
async function createInstance(instanceName) {
  return request('POST', '/instance/create', {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  });
}

// Get QR code / connection state
async function getInstanceQr(instanceName) {
  return request('GET', `/instance/connect/${instanceName}`);
}

async function getInstanceStatus(instanceName) {
  return request('GET', `/instance/connectionState/${instanceName}`);
}

// Delete instance
async function deleteInstance(instanceName) {
  return request('DELETE', `/instance/delete/${instanceName}`);
}

// Send text message
async function sendText(instanceName, to, text) {
  return request('POST', `/message/sendText/${instanceName}`, {
    number: to,
    text,
  });
}

// Extract phone number from remoteJid (e.g. "5491112345678@s.whatsapp.net" → "5491112345678")
function parseRemoteJid(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.replace(/@.*$/, '').replace(/[^0-9]/g, '');
}

// Extract text content from an Evolution API message object
function extractText(data) {
  const msg = data?.message;
  if (!msg) return null;
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || null;
}

module.exports = { createInstance, getInstanceQr, getInstanceStatus, deleteInstance, sendText, parseRemoteJid, extractText };
