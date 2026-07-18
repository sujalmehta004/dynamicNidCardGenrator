const { execFile } = require('child_process');
const os = require('os');

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
  if (typeof res.send !== 'function') {
    res.send = function (data) { this.end(data); return this; };
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fallbackHostname = os.hostname() || '';

  execFile('hostname', (error, stdout, stderr) => {
    const hostname = (stdout || '').toString().trim() || (stderr || '').toString().trim() || fallbackHostname;

    if (error && !hostname) {
      return res.status(500).json({ error: 'Failed to resolve hostname', details: error.message });
    }

    return res.status(200).json({ hostname, source: error ? 'fallback' : 'hostname' });
  });
};
