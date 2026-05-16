const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const MessageHistory = require('../models/MessageHistory');

// Lazy client — picks up the current ANTHROPIC_API_KEY on each call so
// Settings changes take effect without restarting the server.
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

const LIMIT_MESSAGE = 'Has alcanzado tu límite de mensajes del plan actual. Contactanos para hacer un upgrade y seguir disfrutando del servicio. 🚀';
const MAX_HISTORY = 10;
const MAX_RETRIES = 2;

async function callClaude(messages, systemPrompt, retries = 0) {
  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    return response;
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

  if (bot.faqs && bot.faqs.length > 0) {
    prompt += '\n\n--- PREGUNTAS FRECUENTES ---\n';
    bot.faqs.forEach(faq => {
      prompt += `P: ${faq.question}\nR: ${faq.answer}\n\n`;
    });
  }

  return prompt;
}

router.post('/whatsapp', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const startTime = Date.now();

  const incomingMsg = req.body.Body?.trim();
  const senderNumber = req.body.From;
  const toNumber = req.body.To;

  if (!incomingMsg || !senderNumber) {
    res.type('text/xml').send(twiml.toString());
    return;
  }

  let bot = null;
  let historyEntry = null;

  try {
    // Find bot by Twilio number
    bot = await Bot.findOne({ twilioNumber: toNumber, active: true });
    if (!bot) {
      console.warn(`[webhook] No active bot found for number: ${toNumber}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    // Check plan limit
    if (bot.hasReachedLimit()) {
      console.log(`[webhook] Bot ${bot._id} reached limit (${bot.messageCount}/${bot.planLimit})`);
      twiml.message(LIMIT_MESSAGE);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    // Load or create conversation
    let conversation = await Conversation.findOne({ botId: bot._id, senderNumber });
    if (!conversation) {
      conversation = new Conversation({ botId: bot._id, senderNumber, messages: [] });
    }

    // Keep last MAX_HISTORY messages for context
    const recentMessages = conversation.messages.slice(-MAX_HISTORY);
    const claudeMessages = [
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: incomingMsg },
    ];

    const systemPrompt = buildSystemPrompt(bot);

    // Call Claude (with retries)
    const claudeResponse = await callClaude(claudeMessages, systemPrompt);
    const replyText = claudeResponse.content[0]?.text ?? 'Lo siento, no pude procesar tu mensaje.';
    const tokensUsed = (claudeResponse.usage?.input_tokens ?? 0) + (claudeResponse.usage?.output_tokens ?? 0);
    const processingTime = Date.now() - startTime;

    // Update conversation history
    conversation.messages.push({ role: 'user', content: incomingMsg });
    conversation.messages.push({ role: 'assistant', content: replyText });
    // Trim to keep only last MAX_HISTORY * 2 messages (user + assistant pairs)
    if (conversation.messages.length > MAX_HISTORY * 2) {
      conversation.messages = conversation.messages.slice(-(MAX_HISTORY * 2));
    }
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Increment message count
    await Bot.findByIdAndUpdate(bot._id, { $inc: { messageCount: 1 } });

    // Log to message history
    historyEntry = new MessageHistory({
      botId: bot._id,
      senderNumber,
      message: incomingMsg,
      response: replyText,
      tokensUsed,
      processingTime,
    });
    await historyEntry.save();

    console.log(`[webhook] Bot ${bot.name} | ${senderNumber} | ${tokensUsed} tokens | ${processingTime}ms`);

    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());

  } catch (err) {
    console.error('[webhook] Error:', err.message);

    // Log failed attempt
    if (bot) {
      await MessageHistory.create({
        botId: bot._id,
        senderNumber,
        message: incomingMsg,
        error: err.message,
        processingTime: Date.now() - startTime,
      }).catch(() => {});
    }

    twiml.message('Lo siento, estoy teniendo dificultades técnicas. Por favor intenta nuevamente en unos minutos.');
    res.type('text/xml').send(twiml.toString());
  }
});

module.exports = router;
