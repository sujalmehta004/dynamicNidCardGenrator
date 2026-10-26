const https = require("https");
const zlib = require("zlib");
const connectToDatabase = require("../lib/db");
const mongoose = require("mongoose");

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== "string") return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.split("=");
    if (!key) return acc;
    acc[key.trim()] = rest.join("=").trim();
    return acc;
  }, {});
}

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

        const handleResult = (err, decoded) => {
          if (err) return reject(err);
          resolve({ status: res.statusCode, headers: res.headers, body: decoded });
        };

        if (encoding === "gzip") {
          zlib.gunzip(buffer, handleResult);
        } else if (encoding === "deflate") {
          zlib.inflate(buffer, handleResult);
        } else if (encoding === "br") {
          zlib.brotliDecompress(buffer, handleResult);
        } else {
          resolve({ status: res.statusCode, headers: res.headers, body: buffer });
        }
      });
    });

    req.on("error", (err) => reject(err));

    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error(`Request timed out after ${options.timeout}ms`));
      });
    }

    req.end();
  });
}

// Helper to get stored captcha if none provided in request
async function getStoredCaptchaFallback() {
  try {
    await connectToDatabase();
    const CaptchaStore = mongoose.models.CaptchaStore ||
      mongoose.model("CaptchaStore", new mongoose.Schema({ key: String, code: String, session: String }, { timestamps: true }));
    const doc = await CaptchaStore.findOne({ key: "shared" }).lean();
    return doc || {};
  } catch (_) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, captcha-code, Captcha-Code, x-captcha-session, X-Captcha-Session");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let requestNumber = req.query.requestNumber || req.query.reqNumber || (req.body && req.body.requestNumber);
  if (!requestNumber) {
    return res.status(400).json({ error: "requestNumber is required" });
  }
  requestNumber = String(requestNumber).trim().replace(/[^0-9]/g, "");
  if (!requestNumber) {
    return res.status(400).json({ error: "Invalid requestNumber" });
  }

  let captchaCode = req.headers["captcha-code"] || req.headers["Captcha-Code"] || (req.body && req.body.captchaCode) || req.query.captchaCode;
  let sessionCookie = req.headers["x-captcha-session"] || req.headers["X-Captcha-Session"] || (req.body && req.body.session);

  // If captcha code is missing, try fallback to DB store
  if (!captchaCode) {
    const fallback = await getStoredCaptchaFallback();
    if (fallback.code) {
      captchaCode = fallback.code;
      if (!sessionCookie && fallback.session) sessionCookie = fallback.session;
    }
  }

  if (!captchaCode) {
    return res.status(400).json({ error: "Captcha-Code is required" });
  }

  const targetUrl = `https://api-citizenportal.donidcr.gov.np/api/v1/ninStatus/searchByRequestNumber/${encodeURIComponent(requestNumber)}`;

  try {
    const requestHeaders = {
      "Host": "api-citizenportal.donidcr.gov.np",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Captcha-Code": captchaCode.trim(),
      "Origin": "https://citizenportal.donidcr.gov.np",
      "Referer": "https://citizenportal.donidcr.gov.np/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "Connection": "keep-alive"
    };

    if (sessionCookie) {
      try {
        requestHeaders.Cookie = Buffer.from(sessionCookie, "base64").toString("utf8");
      } catch (_) {
        requestHeaders.Cookie = sessionCookie;
      }
    }

    const resp = await makeHttpsRequest(targetUrl, {
      method: "GET",
      headers: requestHeaders,
      timeout: 20000
    });

    const bodyString = resp.body.toString("utf8");
    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyString);
    } catch (_) {
      parsedBody = { raw: bodyString };
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(resp.status).json(parsedBody);

  } catch (err) {
    return res.status(500).json({ error: "Failed to connect to NID citizen portal", details: err.message });
  }
};
