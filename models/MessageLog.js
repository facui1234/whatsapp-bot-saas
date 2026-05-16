const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  botId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Bot',    required: true, index: true },
  clientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  senderNumber: { type: String },
  messageText:  { type: String },
  responseText: { type: String },
  tokensUsed:   { type: Number, default: 0 },
  timestamp:    { type: Date,   default: Date.now, index: true },
  hour:         { type: Number, min: 0, max: 23, index: true },
  dayOfWeek:    { type: Number, min: 0, max: 6,  index: true }, // 0=Sunday
  date:         { type: String, index: true },  // YYYY-MM-DD
  month:        { type: String, index: true },  // YYYY-MM
}, { timestamps: false });

schema.index({ botId: 1, timestamp: -1 });
schema.index({ clientId: 1, timestamp: -1 });

module.exports = mongoose.model('MessageLog', schema);
