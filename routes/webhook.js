const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');
const MessageLog = require('../models/MessageLog');
const { sendText, parseRemoteJid, extractText } = require('../services/evolutionApi');

// Lazy Claude client — picks up current API key on each call
let anthropicClient = null;
let cachedKey = null;
function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada');
  if (!anthropicClient || cachedKey !== key) {
    anthropicClient = new Anthropic({ apiKey: key });
    cachedKey = key;
  }
  return anthropicClient;
}

const LIMIT_MESSAGE = 'Has alcanzado tu límite de mensajes del plan actual. Contactanos para hacer un upgrade. 🚀';
const MAX_HISTORY = 10;
const MAX_RETRIES = 2;

async function callClaude(messages, systemPrompt, retries = 0) {
  try {
    return await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
      return callClaude(messages, systemPrompt, retries + 1);
    }
    throw err;
  }
}

function buildSystemPrompt(bot) {
  let prompt = bot.systemPrompt;
  if (bot.faqs?.length) {
    prompt += '\n\n--- PREGUNTAS FRECUENTES ---\n';
    bot.faqs.forEach(f => { prompt += `P: ${f.question}\nR: ${f.answer}\n\n`; });
  }
  if (bot.knowledgeBases?.length) {
    for (const kb of bot.knowledgeBases) {
      if (kb.enabled && kb.content) {
        prompt += `\n\n--- BASE DE CONOCIMIENTO: ${kb.name} ---\n${kb.content}\n--- FIN: ${kb.name} ---`;
      }
    }
  }
  return prompt;
}

// ── Evolution API webhook ─────────────────────────────────────────────────────
router.post('/evolution', async (req, res) => {
  // Respond 200 immediately so Evolution API doesn't retry
  res.sendStatus(200);

  const { event, instance, data } = req.body ?? {};

  // Only handle incoming user messages
  if (event !== 'messages.upsert') return;
  if (data?.key?.fromMe) return;
  const remoteJid = data?.key?.remoteJid ?? '';
  if (!remoteJid.endsWith('@s.whatsapp.net')) return; // skip groups

  const incomingMsg = extractText(data);
  const senderNumber = parseRemoteJid(remoteJid);
  if (!incomingMsg || !senderNumber) return;

  const startTime = Date.now();
  let bot = null;

  try {
    bot = await Bot.findOne({ evolutionInstanceName: instance, status: 'active' });
    if (!bot) {
      console.warn(`[webhook] No active bot for instance: ${instance}`);
      return;
    }

    if (bot.hasReachedLimit()) {
      console.log(`[webhook] Bot ${bot._id} reached limit`);
      await sendText(instance, senderNumber, LIMIT_MESSAGE).catch(() => {});
      return;
    }

    // Load or create conversation
    let conversation = await Conversation.findOne({ botId: bot._id, senderNumber });
    if (!conversation) conversation = new Conversation({ botId: bot._id, senderNumber, messages: [] });

    const recentMessages = conversation.messages.slice(-MAX_HISTORY);
    const claudeMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: incomingMsg },
    ];

    const claudeResponse = await callClaude(claudeMessages, buildSystemPrompt(bot));
    const replyText = claudeResponse.content[0]?.text ?? 'Lo siento, no pude procesar tu mensaje.';
    const tokensUsed = (claudeResponse.usage?.input_tokens ?? 0) + (claudeResponse.usage?.output_tokens ?? 0);
    const processingTime = Date.now() - startTime;

    // Update conversation
    conversation.messages.push({ role: 'user', content: incomingMsg });
    conversation.messages.push({ role: 'assistant', content: replyText });
    if (conversation.messages.length > MAX_HISTORY * 2) {
      conversation.messages = conversation.messages.slice(-(MAX_HISTORY * 2));
    }
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Auto-reset monthly counters
    const currentMonthYear = new Date().toISOString().substring(0, 7);
    if (bot.currentMonthYear !== currentMonthYear) {
      await Bot.findByIdAndUpdate(bot._id, { messageCountThisMonth: 0, tokensUsedThisMonth: 0, currentMonthYear });
    }
    await Bot.findByIdAndUpdate(bot._id, {
      $inc: { messageCount: 1, messageCountThisMonth: 1, tokensUsedThisMonth: tokensUsed },
    });

    // Log to MessageHistory and MessageLog (analytics)
    const now = new Date();
    await Promise.allSettled([
      MessageHistory.create({
        botId: bot._id,
        ...(bot.clientId ? { clientId: bot.clientId } : {}),
        senderNumber,
        message: incomingMsg,
        response: replyText,
        tokensUsed,
        processingTime,
      }),
      MessageLog.create({
        botId: bot._id,
        ...(bot.clientId ? { clientId: bot.clientId } : {}),
        senderNumber,
        messageText: incomingMsg,
        responseText: replyText,
        tokensUsed,
        timestamp: now,
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        date: now.toISOString().substring(0, 10),
        month: now.toISOString().substring(0, 7),
      }),
    ]);

    // Send reply via Evolution API
    await sendText(instance, senderNumber, replyText);
    console.log(`[webhook] ${bot.name} | ${senderNumber} | ${tokensUsed} tokens | ${processingTime}ms`);

  } catch (err) {
    console.error('[webhook] Error:', err.message);
    if (bot) {
      await MessageHistory.create({
        botId: bot._id,
        senderNumber,
        message: incomingMsg,
        error: err.message,
        processingTime: Date.now() - startTime,
      }).catch(() => {});
    }
  }
});

module.exports = router;
