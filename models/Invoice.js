const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  month: { type: String, required: true }, // "2025-05"
  totalMessages: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  totalCostReal: { type: Number, default: 0 },   // actual Anthropic cost
  totalCostClient: { type: Number, default: 0 }, // price charged to client (3x markup)
  bots: [{
    botId: { type: mongoose.Schema.Types.ObjectId },
    botName: String,
    messages: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    costReal: { type: Number, default: 0 },
    costClient: { type: Number, default: 0 },
  }],
  status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue'], default: 'draft' },
  sentDate: { type: Date },
  paidDate: { type: Date },
  notes: { type: String },
}, { timestamps: true });

invoiceSchema.index({ clientId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
