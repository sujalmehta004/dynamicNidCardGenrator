const connectToDatabase = require("./db");
const AllowedIp = require("./models/AllowedIp");

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Database connection error:", error);
    return res.status(500).json({ error: "Database connection failed" });
  }

  const { method } = req;
  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

  res.setHeader("Content-Type", "application/json");

  switch (method) {
    case "GET":
      try {
        const allowed = await AllowedIp.find({});
        const allowedList = allowed.map(x => x.ip);
        
        // Also check if the client IP is in the allowed list
        const isAllowed = allowedList.includes(clientIp);

        return res.status(200).json({
          clientIp,
          isAllowed,
          allowedIps: allowed
        });
      } catch (err) {
        return res.status(500).json({ error: "Failed to retrieve allowed IPs", details: err.message });
      }

    case "POST":
      try {
        const { ip, password } = req.body;
        
        // Validate password
        if (password !== "admin9805344374") {
          return res.status(403).json({ error: "Unauthorized: Invalid password" });
        }

        if (!ip) {
          return res.status(400).json({ error: "IP address is required" });
        }

        const existing = await AllowedIp.findOne({ ip: ip.trim() });
        if (existing) {
          return res.status(200).json(existing);
        }

        const newIp = new AllowedIp({ ip: ip.trim() });
        await newIp.save();
        return res.status(201).json(newIp);
      } catch (err) {
        return res.status(500).json({ error: "Failed to save allowed IP", details: err.message });
      }

    case "DELETE":
      try {
        const { ip, password } = req.query;

        // Validate password
        if (password !== "admin9805344374") {
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
