const connectToDatabase = require('../lib/db');
const mongoose = require('mongoose');

// Simple key-value store using a dedicated collection
const CaptchaStoreSchema = new mongoose.Schema({
  key: { type: String, default: 'shared', unique: true },
  code: { type: String, default: '' },
  session: { type: String, default: '' },
  savedAt: { type: Date, default: null },
}, { timestamps: true });

const CaptchaStore = mongoose.models.CaptchaStore ||
  mongoose.model('CaptchaStore', CaptchaStoreSchema);

module.exports = async (req, res) => {
  if (typeof res.status !== 'function') {
    res.status = function (s) { this.statusCode = s; return this; };
  }
  if (typeof res.json !== 'function') {
    res.json = function (d) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(d));
      return this;
    };
  }
  if (typeof res.send !== 'function') {
    res.send = function (d) { this.end(d); return this; };
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await connectToDatabase();
  } catch (err) {
    return res.status(500).json({ error: 'DB connection failed: ' + err.message });
  }

  // GET — return the stored captcha
  if (req.method === 'GET') {
    try {
      const doc = await CaptchaStore.findOne({ key: 'shared' }).lean();
      if (!doc || !doc.code) {
        return res.status(200).json({ code: '', session: '', savedAt: null });
      }
      return res.status(200).json({
        code: doc.code,
        session: doc.session || '',
        savedAt: doc.savedAt || doc.updatedAt || null,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read captcha store: ' + err.message });
    }
  }

  // POST — save/update the captcha
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }
      const { code, session, savedAt } = body || {};
      if (!code) return res.status(400).json({ error: 'code is required' });

      const cleanCode = String(code).trim();
      const existing = await CaptchaStore.findOne({ key: 'shared' }).lean();
      const isSameCode = existing && existing.code && existing.code.trim() === cleanCode;

      let finalSavedAt;
      if (savedAt) {
        finalSavedAt = new Date(savedAt);
      } else if (isSameCode && (existing.savedAt || existing.createdAt)) {
        finalSavedAt = existing.savedAt || existing.createdAt;
      } else {
        finalSavedAt = new Date();
      }

      const doc = await CaptchaStore.findOneAndUpdate(
        { key: 'shared' },
        { code: cleanCode, session: session || '', savedAt: finalSavedAt },
        { new: true, upsert: true }
      );
      return res.status(200).json({ ok: true, code: doc.code, savedAt: doc.savedAt });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save captcha: ' + err.message });
    }
  }

  // DELETE — clear the stored captcha
  if (req.method === 'DELETE') {
    try {
      await CaptchaStore.findOneAndUpdate(
        { key: 'shared' },
        { code: '', session: '', savedAt: null },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to clear captcha: ' + err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};
