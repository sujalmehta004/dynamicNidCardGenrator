const mongoose = require("mongoose");

const AllowedComputerSchema = new mongoose.Schema({
  computerName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.AllowedComputer || mongoose.model("AllowedComputer", AllowedComputerSchema);
