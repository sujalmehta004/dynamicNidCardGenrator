const mongoose = require('mongoose');
const { connectToSecondaryDatabase } = require('../db');

let cachedModel = null;

async function getVoterListRecordModel() {
  if (cachedModel) {
    return cachedModel;
  }

  const secondaryConnection = await connectToSecondaryDatabase();
  const schema = new mongoose.Schema({
    nidNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    source: {
      type: String,
      default: 'voter-search'
    },
    portraitImage: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      default: 'pending'
    },
    voterListNumber: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: false
    },
    profileData: {
      type: Object,
      default: {}
    },
    rawPayload: {
      type: Object,
      default: {}
    }
  }, { timestamps: true });

  cachedModel = secondaryConnection.models.VoterListRecord || secondaryConnection.model('VoterListRecord', schema);
  return cachedModel;
}

module.exports = getVoterListRecordModel;
module.exports.getVoterListRecordModel = getVoterListRecordModel;
