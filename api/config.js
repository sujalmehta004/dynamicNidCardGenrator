const connectToDatabase = require('../lib/db');
const Config = require('../lib/models/Config');

module.exports = async (req, res) => {
  if (typeof res.status !== 'function') {
    res.status = function (statusCode) { this.statusCode = statusCode; return this; };
  }
  if (typeof res.json !== 'function') {
    res.json = function (data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }

  const method = req.method;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url || '';
  if (req.query?.action === 'hostname' || url.includes('/api/hostname')) {
    const os = require('os');
    const { execFile } = require('child_process');
    const fallbackHostname = os.hostname() || '';
    return new Promise((resolve) => {
      execFile('hostname', (error, stdout, stderr) => {
        const hostname = (stdout || '').toString().trim() || (stderr || '').toString().trim() || fallbackHostname;
        res.status(200).json({ hostname, source: error ? 'fallback' : 'hostname' });
        resolve();
      });
    });
  }

  try {
    await connectToDatabase();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  if (method === 'GET') {
    try {
      let config = await Config.findOne({ key: 'default' });
      if (!config) {
        // Create initial default settings if none exists
        config = new Config({
          key: 'default',
          borderRadius: 0,
          fontSize: 100,
          verticalGap: 6,
          fontWidth: 0,
          backgroundFit: '100% 100%',
          cardDesign: 'smart card',
          hideFormTab: false
        });
        await config.save();
      }

      const sanitizedConfig = config.toObject ? config.toObject() : { ...config };
      return res.status(200).json(sanitizedConfig);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve configuration', details: err.message });
    }
  }

  if (method === 'POST') {
    try {
      const data = req.body;
      const config = await Config.findOneAndUpdate(
        { key: 'default' },
        {
          borderRadius: data.borderRadius ?? 0,
          fontSize: data.fontSize ?? 100,
          verticalGap: data.verticalGap ?? 6,
          fontWidth: data.fontWidth ?? 0,
          backgroundFit: data.backgroundFit ?? '100% 100%',
          cardDesign: data.cardDesign ?? 'smart card',
          hideFormTab: data.hideFormTab ?? false
        },
        { new: true, upsert: true }
      );
      const sanitizedConfig = config.toObject ? config.toObject() : { ...config };
      return res.status(200).json(sanitizedConfig);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update configuration', details: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${method} Not Allowed` });
};
