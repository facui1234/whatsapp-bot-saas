const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  rubric: {
    type: String,
    enum: ['restaurante', 'clinica', 'ecommerce', 'servicios', 'otro'],
    required: true,
  },
  plan: { type: String, enum: ['basic', 'pro', 'enterprise'], default: 'basic' },
  monthlyBudget: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'inactive'], default: 'active' },
  notes: { type: String },
  lastInvoiceDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
