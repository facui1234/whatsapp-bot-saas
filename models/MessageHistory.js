const mongoose = require('mongoose');

const messageHistorySchema = new mongoose.Schema({
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true, index: true },
  senderNumber: { type: String, required: true },
  message: { type: String, required: true },
  response: { type: String },
  tokensUsed: { type: Number, default: 0 },
  processingTime: { type: Number, default: 0 },
  error: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

module.exports = mongoose.model('MessageHistory', messageHistorySchema);
