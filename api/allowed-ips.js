const connectToDatabase = require("../lib/db");
const AllowedIp = require("../lib/models/AllowedIp");
const dns = require("dns");
const AllowedComputer = require("../lib/models/AllowedComputer");

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
        const allowed = await AllowedIp.find({});
        const allowedComputers = await AllowedComputer.find({});

        const allowedList = allowed
          .map(x => (x.ip || "").trim())
          .filter(ip => ip !== "");
        const allowedComputerNames = allowedComputers
          .map(c => (c.computerName || "").trim())
          .filter(n => n !== "");
        
        const cleanClientIp = (clientIp || "").trim();
        const isAllowedByIp = cleanClientIp !== "" && allowedList.includes(cleanClientIp);
        const isAllowedByComputer = (req.headers['x-client-computer-name'] || '').trim() !== '' && allowedComputerNames.includes((req.headers['x-client-computer-name'] || '').trim());
        const isAllowed = isAllowedByIp || isAllowedByComputer;

        // Return computerName as part of allowed records (schema updated)
        return res.status(200).json({
          clientIp: cleanClientIp,
          isAllowed,
          allowedIps: allowed,
          allowedComputers: allowedComputers
        });
      } catch (err) {
        return res.status(500).json({ error: "Failed to retrieve allowed IPs", details: err.message });
      }

    case "POST":
      try {
        const { ip, password, computerName } = req.body;

        // If client is adding a computer-only allow (no IP), require the special device password
        if ((!ip || String(ip).trim() === "") && computerName && typeof computerName === 'string' && computerName.trim() !== '') {
          if (password !== "Alphagamma010@") {
            return res.status(403).json({ error: "Unauthorized: Invalid device password" });
          }

          const trimmedName = computerName.trim();
          let existingComp = await AllowedComputer.findOne({ computerName: trimmedName });
          if (existingComp) {
            return res.status(200).json(existingComp);
          }

          const newComp = new AllowedComputer({ computerName: trimmedName });
          await newComp.save();
          return res.status(201).json(newComp);
        }

        // Otherwise this is an IP-based request — require admin password
        if (password !== "Ss9805344374@><") {
          return res.status(403).json({ error: "Unauthorized: Invalid password" });
        }

        if (!ip) {
          return res.status(400).json({ error: "IP address is required" });
        }

        const trimmedIp = ip.trim();

        // If document exists, return it (but try to enrich computerName if missing)
        let existing = await AllowedIp.findOne({ ip: trimmedIp });
        if (existing) {
          // If client provided a computerName, save it (admin UI may send it)
          if (computerName && typeof computerName === 'string' && computerName.trim() !== '') {
            existing.computerName = computerName.trim();
            await existing.save();
            return res.status(200).json(existing);
          }

          // If computerName empty, try to reverse-resolve as a fallback
          if (!existing.computerName || existing.computerName.trim() === "") {
            try {
              const hostnames = await dns.promises.reverse(trimmedIp);
              if (Array.isArray(hostnames) && hostnames.length > 0) {
                existing.computerName = hostnames[0];
                await existing.save();
              }
            } catch (e) {
              // ignore reverse lookup errors
            }
          }
          return res.status(200).json(existing);
        }

        // Attempt to auto-detect computer name via reverse DNS when possible
        let detectedName = "";
        try {
          const hostnames = await dns.promises.reverse(trimmedIp);
          if (Array.isArray(hostnames) && hostnames.length > 0) {
            detectedName = hostnames[0];
          }
        } catch (e) {
          // reverse lookup may fail (private IPs, no PTR record) — fallback to empty string
          detectedName = "";
        }

        const newIp = new AllowedIp({ ip: trimmedIp, computerName: detectedName });
        await newIp.save();
        return res.status(201).json(newIp);
      } catch (err) {
        return res.status(500).json({ error: "Failed to save allowed IP", details: err.message });
      }

    case "DELETE":
      try {
        const { ip, password } = req.query;

        // Validate password
        if (password !== "Ss9805344374@><") {
          return res.status(403).json({ error: "Unauthorized: Invalid password" });
        }

        if (!ip) {
          return res.status(400).json({ error: "IP parameter is required" });
        }

        const deleted = await AllowedIp.findOneAndDelete({ ip: ip.trim() });
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
