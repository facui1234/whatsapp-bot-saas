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
