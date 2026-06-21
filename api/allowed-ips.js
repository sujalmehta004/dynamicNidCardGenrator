const connectToDatabase = require("./db");
const AllowedIp = require("./models/AllowedIp");

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

  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Database connection error:", error);
    return res.status(500).json({ error: "Database connection failed" });
  }

  const { method } = req;
  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    return res.status(200).end();
  }

  switch (method) {
    case "GET":
      try {
        const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        const queryIp = urlParams.get("ip");
        const queryToken = urlParams.get("token");

        const allowed = await AllowedIp.find({});
        
        let isAllowed = false;
        const cleanClientIp = (queryIp || clientIp || "").trim();
        const cleanToken = (queryToken || "").trim();

        if (cleanClientIp && cleanToken) {
          const match = await AllowedIp.findOne({ ip: cleanClientIp });
          if (match) {
            if (!match.token || match.token.trim() === "") {
              // First computer to open with this whitelisted IP auto-binds its token
              match.token = cleanToken;
              await match.save();
              isAllowed = true;
            } else if (match.token.trim() === cleanToken) {
              isAllowed = true;
            }
          }
        }

        return res.status(200).json({
          clientIp: cleanClientIp,
          isAllowed,
          allowedIps: allowed
        });
      } catch (err) {
        return res.status(500).json({ error: "Failed to retrieve allowed IPs", details: err.message });
      }

    case "POST":
      try {
        const { ip, password, token } = req.body;
        
        // Validate password
        if (password !== "Ss9805344374@><") {
          return res.status(403).json({ error: "Unauthorized: Invalid password" });
        }

        if (!ip) {
          return res.status(400).json({ error: "IP address is required" });
        }

        if (!token) {
          return res.status(400).json({ error: "Device token is required" });
        }

        const existing = await AllowedIp.findOne({ ip: ip.trim() });
        if (existing) {
          if (existing.token && existing.token.trim() !== token.trim()) {
            return res.status(409).json({ error: "This IP address is already registered to another computer." });
          }
          // Update/ensure token matches
          existing.token = token.trim();
          await existing.save();
          return res.status(200).json(existing);
        }

        const newIp = new AllowedIp({ ip: ip.trim(), token: token.trim() });
        await newIp.save();
        return res.status(201).json(newIp);
      } catch (err) {
        return res.status(500).json({ error: "Failed to save allowed IP", details: err.message });
      }

    case "DELETE":
      try {
        const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        const queryIp = urlParams.get("ip");
        const queryPassword = urlParams.get("password");

        // Validate password
        if (queryPassword !== "Ss9805344374@><") {
          return res.status(403).json({ error: "Unauthorized: Invalid password" });
        }

        if (!queryIp) {
          return res.status(400).json({ error: "IP parameter is required" });
        }

        const deleted = await AllowedIp.findOneAndDelete({ ip: queryIp.trim() });
        if (!deleted) {
          return res.status(404).json({ error: "IP not found" });
        }

        return res.status(200).json({ message: "IP deleted successfully", deleted });
      } catch (err) {
        return res.status(500).json({ error: "Failed to delete IP", details: err.message });
      }

    default:
      res.setHeader("Allow", ["GET", "POST", "DELETE"]);
      return res.status(405).json({ error: `Method ${method} Not Allowed` });
  }
};
