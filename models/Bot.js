const mongoose = require('mongoose');

const PLANS = {
  basic: { name: 'Básico', messageLimit: 100 },
  pro: { name: 'Pro', messageLimit: 500 },
  enterprise: { name: 'Enterprise', messageLimit: Infinity },
};

const botSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  twilioNumber: { type: String, required: true, trim: true },
  rubric: {
    type: String,
    enum: ['restaurante', 'clinica', 'ecommerce', 'servicios', 'otro'],
    required: true,
  },
  systemPrompt: { type: String, required: true },
  faqs: [{ question: String, answer: String }],
  plan: { type: String, enum: ['basic', 'pro', 'enterprise'], default: 'basic' },
  messageCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  messageCountThisMonth: { type: Number, default: 0 },
  tokensUsedThisMonth: { type: Number, default: 0 },
  currentMonthYear: { type: String, default: '' },
  knowledgeBases: [{
    name:                   { type: String,  default: 'Base de conocimiento' },
    enabled:                { type: Boolean, default: true },
    sourceUrl:              { type: String,  default: '' },
    content:                { type: String,  default: '' },
    lastFetched:            { type: Date },
    lastError:              { type: String,  default: '' },
    status:                 { type: String,  enum: ['idle', 'ok', 'error'], default: 'idle' },
    refreshIntervalMinutes: { type: Number,  default: 1, min: 1, max: 60 },
  }],
}, { timestamps: true });

botSchema.virtual('planLimit').get(function () {
  return PLANS[this.plan]?.messageLimit ?? 100;
});

botSchema.virtual('planName').get(function () {
  return PLANS[this.plan]?.name ?? 'Básico';
});

botSchema.methods.hasReachedLimit = function () {
  const limit = PLANS[this.plan]?.messageLimit ?? 100;
  return limit !== Infinity && this.messageCount >= limit;
};

module.exports = mongoose.model('Bot', botSchema);
module.exports.PLANS = PLANS;
