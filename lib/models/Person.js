const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema({
  ninEn: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  ninNp: {
    type: String,
    trim: true,
  },
  givenEn: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  givenNp: {
    type: String,
    trim: true,
  },
  surnameEn: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  surnameNp: {
    type: String,
    trim: true,
  },
  dobEn: {
    type: String,
    trim: true,
  },
  dobNp: {
    type: String,
    trim: true,
  },
  nationality: {
    type: String,
    trim: true,
    uppercase: true,
    default: 'NEPALI',
  },
  citDate: {
    type: String,
    trim: true,
  },
  downloadDate: {
    type: String,
    trim: true,
  },
  regDate: {
    type: String,
    trim: true,
  },
  updateDate: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'done', 'inprogress', 'not online'],
    default: 'done',
  },
  addressEn: {
    type: String,
    trim: true,
  },
  addressNp: {
    type: String,
    trim: true,
  },
  baseUrl: {
    type: String,
    trim: true,
  },
  token: {
    type: String,
    trim: true,
  },
  mobile: {
    type: String,
    trim: true,
  },
  cardDesign: {
    type: String,
    enum: ['white card', 'smart card'],
    default: 'smart card',
    trim: true,
  },
  computerName: {
    type: String,
    trim: true,
  },
  nickname: {
    type: String,
    trim: true,
  },
  updatedComputerName: {
    type: String,
    trim: true,
  },
  updatedNickname: {
    type: String,
    trim: true,
  },
  updateHistory: [
    {
      updatedAt: {
        type: Date,
        default: Date.now,
      },
      updateDate: {
        type: String,
        trim: true,
      },
      action: {
        type: String,
        default: 'Record Updated',
        trim: true,
      },
      note: {
        type: String,
        trim: true,
      },
      computerName: {
        type: String,
        trim: true,
      },
      nickname: {
        type: String,
        trim: true,
      },
      changedFields: [{
        type: String,
        trim: true,
      }],
      changes: {
        type: mongoose.Schema.Types.Mixed,
      },
      snapshot: {
        type: mongoose.Schema.Types.Mixed,
      },
    },
  ],
}, {
  timestamps: true, // Automatically logs createdAt/updatedAt just in case
});

// To prevent compiled model overwrite issues in serverless hot-reloads
if (mongoose.models && mongoose.models.Person) {
  delete mongoose.models.Person;
}
module.exports = mongoose.model('Person', PersonSchema);
