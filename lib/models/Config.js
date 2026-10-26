const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  borderRadius: { type: Number, default: 0 },
  fontSize: { type: Number, default: 100 },
  verticalGap: { type: Number, default: 6 },
  fontWidth: { type: Number, default: 0 }, // Letter spacing/font width control
  backgroundFit: { type: String, default: '100% 100%' },
  cardDesign: { type: String, default: 'smart card' },
  hideFormTab: { type: Boolean, default: false },
  searchParallelism: { type: Number, default: 2, min: 1, max: 10 },
  voterListParallelism: { type: Number, default: 2, min: 1, max: 10 },
  voterListRetryCount: { type: Number, default: 2, min: 1, max: 10 },
  adminUnlockPassword: { type: String, default: 'admin12345', trim: true },
  deviceListPassword: { type: String, default: 'Ss9805344374@><', trim: true }
}, { timestamps: true });

module.exports = mongoose.models.Config || mongoose.model('Config', ConfigSchema);
