const https = require("https");
const zlib = require("zlib");

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, captcha-code");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const captchaCode = req.headers["captcha-code"] || req.headers["Captcha-Code"];
  if (!captchaCode) {
    return res.status(400).json({ error: "Captcha-Code header is required" });
  }

  const { fullName, fullNameLoc, dobLoc, ccnIssuingDateLoc } = req.body;
  if (!fullName || !fullNameLoc || !dobLoc || !ccnIssuingDateLoc) {
    return res.status(400).json({ error: "Missing required body fields" });
  }

  const targetUrl = "https://api-citizenportal.donidcr.gov.np/api/v1/mfa/request-otp";
  const postPayload = JSON.stringify({ fullName, fullNameLoc, dobLoc, ccnIssuingDateLoc });

  try {
    // OPTIONS preflight request
    await makeHttpsRequest(targetUrl, {
      method: "OPTIONS",
      headers: {
        "Accept": "*/*",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "captcha-code,content-type",
        "Origin": "https://citizenportal.donidcr.gov.np",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://citizenportal.donidcr.gov.np/",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive"
      }
    });

    // POST request
    const result = await makeHttpsRequest(targetUrl, {
      method: "POST",
      headers: {
        "Host": "api-citizenportal.donidcr.gov.np",
        "Content-Length": Buffer.byteLength(postPayload),
        "Sec-Ch-Ua-Platform": "\"macOS\"",
        "Accept-Language": "en-US,en;q=0.9",
        "Captcha-Code": captchaCode,
        "Sec-Ch-Ua": "\"Not-A.Brand\";v=\"24\", \"Chromium\";v=\"146\"",
        "Sec-Ch-Ua-Mobile": "?0",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://citizenportal.donidcr.gov.np",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://citizenportal.donidcr.gov.np/",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
      }
    }, postPayload);

    res.status(result.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(result.body);
  } catch (error) {
    console.error("OTP request error:", error);
    return res.status(500).json({ error: `OTP request failed: ${error.message}` });
  }
};
