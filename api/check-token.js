const https = require("https");
const zlib = require("zlib");

function makeHttpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || "GET",
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false,
    };

    const req = https.request(reqOptions, (res) => {
      let chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers["content-encoding"];
        if (encoding === "gzip") {
          zlib.gunzip(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, body: decoded.toString() });
          });
        } else if (encoding === "br") {
          zlib.brotliDecompress(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, body: decoded.toString() });
          });
        } else {
          resolve({ status: res.statusCode, body: buffer.toString() });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "token parameter required" });

  try {
    const result = await makeHttpsRequest(
      `https://nin-support-api.donidcr.gov.np/api/v1/enid/verify?token=${encodeURIComponent(token)}`,
      {
        method: "GET",
        headers: {
          "Sec-Ch-Ua": '"Not-A.Brand";v="24", "Chromium";v="146"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"macOS"',
          "Accept-Language": "en-US,en;q=0.9",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-User": "?1",
          "Sec-Fetch-Dest": "document",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
        },
      }
    );

    // Check if the response body indicates an invalid/expired token
    let bodyStr = result.body;
    let isInvalid = false;
    try {
      const parsed = JSON.parse(bodyStr);
      if (parsed && parsed.error) isInvalid = true;
    } catch (e) {
      // If not JSON, it's likely an HTML page = valid token returning a page
    }

    if (result.status >= 400 || isInvalid) {
      return res.status(200).json({ valid: false, reason: "Invalid or expired token" });
    }

    return res.status(200).json({ valid: true });
  } catch (err) {
    console.error("check-token error:", err);
    return res.status(500).json({ error: err.message });
  }
};
