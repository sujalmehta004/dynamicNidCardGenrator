import https from "https";
import zlib from "zlib";

function makeHttpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || "GET",
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false // Bypass SSL leaf certificate validation
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

export default async function handler(req, res) {
  // Allow CORS from our own frontend / vercel env
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dob_loc, ccn_issuing_date_loc, full_name, full_name_loc } = req.body;

  if (!dob_loc || !ccn_issuing_date_loc || !full_name || !full_name_loc) {
    return res.status(400).json({ error: "Missing required fields in request body" });
  }

  const targetUrl = "https://api-citizenportal.donidcr.gov.np/api/v1/enid/download";

  try {
    // 1. Call OPTIONS request first
    console.log("Sending OPTIONS request to citizenportal...");
    const optionsResult = await makeHttpsRequest(targetUrl, {
      method: "OPTIONS",
      headers: {
        "Accept": "*/*",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
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

    console.log("OPTIONS status:", optionsResult.status);

    // 2. Call POST request with exact payload and headers
    console.log("Sending POST request to citizenportal...");
    const postPayload = JSON.stringify({ dob_loc, ccn_issuing_date_loc, full_name, full_name_loc });

    const postResult = await makeHttpsRequest(targetUrl, {
      method: "POST",
      headers: {
        "Host": "api-citizenportal.donidcr.gov.np",
        "Content-Length": Buffer.byteLength(postPayload),
        "Sec-Ch-Ua-Platform": "\"macOS\"",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "application/pdf, application/json, */*",
        "Sec-Ch-Ua": "\"Not-A.Brand\";v=\"24\", \"Chromium\";v=\"146\"",
        "Content-Type": "application/json",
        "Sec-Ch-Ua-Mobile": "?0",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Origin": "https://citizenportal.donidcr.gov.np",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://citizenportal.donidcr.gov.np/",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
      }
    }, postPayload);

    if (postResult.status !== 200) {
      console.error("Failed downloading from government portal. Status:", postResult.status, "Response:", postResult.body.toString());
      return res.status(postResult.status).json({ error: `External portal failed (${postResult.status}): ${postResult.body.toString() || "No response details"}` });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="NID_Card_${full_name.replace(/\s+/g, '_')}.pdf"`);
    return res.send(postResult.body);
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ error: `Internal Proxy Error: ${error.message}` });
  }
}
