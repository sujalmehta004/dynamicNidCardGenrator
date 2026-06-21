const mongoose = require("mongoose");

const AllowedIpSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  token: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.AllowedIp || mongoose.model("AllowedIp", AllowedIpSchema);
