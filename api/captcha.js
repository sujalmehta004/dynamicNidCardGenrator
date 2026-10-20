const https = require("https");
const zlib = require("zlib");
const mongoose = require("mongoose");
const connectToDatabase = require("../lib/db");

// Captcha store schema
const CaptchaStoreSchema = new mongoose.Schema({
  key: { type: String, default: "shared", unique: true },
  code: { type: String, default: "" },
  session: { type: String, default: "" },
  savedAt: { type: Date, default: null },
}, { timestamps: true });

const CaptchaStore = mongoose.models.CaptchaStore ||
  mongoose.model("CaptchaStore", CaptchaStoreSchema);

function makeHttpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || "GET",
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false
    };

    const req = https.request(reqOptions, (res) => {
      let chunks = [];
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers["content-encoding"];

        if (encoding === "gzip") {
          zlib.gunzip(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, headers: res.headers, body: decoded });
          });
        } else if (encoding === "deflate") {
          zlib.inflate(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, headers: res.headers, body: decoded });
          });
        } else if (encoding === "br") {
          zlib.brotliDecompress(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, headers: res.headers, body: decoded });
          });
        } else {
          resolve({ status: res.statusCode, headers: res.headers, body: buffer });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function handleCaptchaStore(req, res) {
  try {
    await connectToDatabase();
  } catch (err) {
    return res.status(500).json({ error: "DB connection failed: " + err.message });
  }

  if (req.method === "GET") {
    try {
      const doc = await CaptchaStore.findOne({ key: "shared" }).lean();
      if (!doc || !doc.code) {
        return res.status(200).json({ code: "", session: "", savedAt: null });
      }
      return res.status(200).json({
        code: doc.code,
        session: doc.session || "",
        savedAt: doc.savedAt || doc.updatedAt || null,
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to read captcha store: " + err.message });
    }
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) {}
      }
      const { code, session, savedAt } = body || {};
      if (!code) return res.status(400).json({ error: "code is required" });

      const cleanCode = String(code).trim();
      const existing = await CaptchaStore.findOne({ key: "shared" }).lean();
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
        { key: "shared" },
        { code: cleanCode, session: session || "", savedAt: finalSavedAt },
        { new: true, upsert: true }
      );
      return res.status(200).json({ ok: true, code: doc.code, savedAt: doc.savedAt });
    } catch (err) {
      return res.status(500).json({ error: "Failed to save captcha: " + err.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await CaptchaStore.findOneAndUpdate(
        { key: "shared" },
        { code: "", session: "", savedAt: null },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to clear captcha: " + err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}

module.exports = async function handler(req, res) {
  if (typeof res.status !== "function") {
    res.status = function (s) { this.statusCode = s; return this; };
  }
  if (typeof res.json !== "function") {
    res.json = function (d) {
      this.setHeader("Content-Type", "application/json");
      this.end(JSON.stringify(d));
      return this;
    };
  }
  if (typeof res.send !== "function") {
    res.send = function (d) { this.end(d); return this; };
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url || "";
  const isStoreAction = (req.query && (req.query.action === "store" || req.query.mode === "store")) ||
                        url.includes("captcha-store") ||
                        req.method === "POST" ||
                        req.method === "DELETE";

  if (isStoreAction) {
    return handleCaptchaStore(req, res);
  }

  try {
    const result = await makeHttpsRequest("https://captcha-citizenportal.donidcr.gov.np/api/captcha", {
      method: "GET",
      headers: {
        "Sec-Ch-Ua-Platform": "\"macOS\"",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "application/json, text/plain, */*",
        "Sec-Ch-Ua": "\"Not-A.Brand\";v=\"24\", \"Chromium\";v=\"146\"",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Sec-Ch-Ua-Mobile": "?0",
        "Origin": "https://citizenportal.donidcr.gov.np",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://citizenportal.donidcr.gov.np/",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
      }
    });

    const rawCookies = result.headers["set-cookie"];
    let cookieValue = "";
    if (rawCookies && Array.isArray(rawCookies) && rawCookies.length) {
      cookieValue = Buffer.from(rawCookies.join("; "), "utf8").toString("base64");
      res.setHeader("Set-Cookie", `captcha-session=${cookieValue}; Path=/; HttpOnly; SameSite=Lax`);
    }

    res.status(result.status);
    res.setHeader("Content-Type", "application/json");
    try {
      const parsed = JSON.parse(result.body.toString("utf8"));
      if (cookieValue) {
        parsed.captchaSession = cookieValue;
      }
      return res.json(parsed);
    } catch (e) {
      return res.send(result.body);
    }
  } catch (error) {
    console.error("Captcha fetch error:", error);
    return res.status(500).json({ error: `Failed to fetch captcha: ${error.message}` });
  }
};
