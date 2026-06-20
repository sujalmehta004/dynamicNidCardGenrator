const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  borderRadius: { type: Number, default: 0 },
  fontSize: { type: Number, default: 100 },
  verticalGap: { type: Number, default: 6 },
  fontWidth: { type: Number, default: 0 }, // Letter spacing/font width control
  backgroundFit: { type: String, default: '100% 100%' }
}, { timestamps: true });

module.exports = mongoose.models.Config || mongoose.model('Config', ConfigSchema);
