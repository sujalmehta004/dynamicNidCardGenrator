const connectToDatabase = require("./db");
const Person = require("./models/Person");

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Database connection error:", error);
    return res.status(500).json({ error: "Database connection failed" });
  }

  const { nin } = req.query;

  if (!nin) {
    return res.status(400).json({ error: "NIN (National Identity Number) parameter is required" });
  }

  try {
    // Find the person by NIN
    const person = await Person.findOne({ ninEn: nin.trim() });

    if (!person) {
      res.setHeader("Content-Type", "text/html");
      return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Identity Status Verification - Not Found</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    }
    .glass-panel {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 text-slate-100 antialiased">
  <div class="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl text-center flex flex-col gap-5">
    <div class="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-550 mx-auto">
      <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
    </div>
    <div>
      <h2 class="text-lg font-bold text-red-400">Record Not Found</h2>
      <p class="text-xs text-slate-400 mt-2">
        No registered profile could be matched with the National Identity Number (NIN): <strong>${nin}</strong>.
      </p>
    </div>
    <div class="pt-2">
      <a href="/" class="inline-block bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-6 py-2.5 rounded-xl text-xs transition-all">
        Go to Dashboard
      </a>
    </div>
  </div>
</body>
</html>`);
    }

    // If token exists, redirect to government verification page with token
    if (person.token && person.token.trim() !== "") {
      const redirectUrl = `https://nin-support-api.donidcr.gov.np/api/v1/enid/verify?token=${encodeURIComponent(person.token.trim())}`;
      res.writeHead(302, { Location: redirectUrl });
      return res.end();
    }

    // Otherwise, return the beautifully formatted profile HTML page showing "NID number token is not configured or not online"
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Identity Status Verification</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Mukta:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    }
    .nepali-font {
      font-family: 'Mukta', sans-serif;
    }
    .glass-panel {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 text-slate-100 antialiased">
  <div class="w-full max-w-2xl glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col gap-6">
    <!-- Glowing background accent -->
    <div class="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

    <!-- Header status -->
    <div class="flex flex-col items-center text-center gap-3 border-b border-white/10 pb-5">
      <div class="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-lg shadow-amber-500/5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <div>
        <h2 class="text-lg font-bold text-amber-400 tracking-tight font-sans">Identity Token Not Configured</h2>
        <p class="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
          Your NID number token is not configured or not online.
        </p>
      </div>
    </div>

    <!-- NID Banner -->
    <div class="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div>
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">National Identity Number</span>
        <div class="text-md font-bold text-white font-mono mt-0.5">${person.ninEn}</div>
      </div>
      <div class="text-right sm:text-left">
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider nepali-font">राष्ट्रिय परिचय नम्बर</span>
        <div class="text-md font-bold text-white font-mono mt-0.5 nepali-font">${person.ninNp || "—"}</div>
      </div>
    </div>

    <!-- Profile Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04]">
        <span class="text-slate-400 font-medium">Full Name (English)</span>
        <div class="text-sm font-bold text-slate-200 uppercase">${person.givenEn} ${person.surnameEn}</div>
      </div>
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04] nepali-font">
        <span class="text-slate-400 font-medium">पुरा नाम (नेपाली)</span>
        <div class="text-sm font-bold text-slate-200">${person.givenNp || ""} ${person.surnameNp || ""}</div>
      </div>
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04]">
        <span class="text-slate-400 font-medium">Date of Birth (AD / BS)</span>
        <div class="text-sm font-bold text-slate-200 font-mono">${person.dobEn || "—"} <span class="text-slate-400 font-normal">/</span> ${person.dobNp || "—"}</div>
      </div>
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04]">
        <span class="text-slate-400 font-medium">Citizenship Issue Date</span>
        <div class="text-sm font-bold text-slate-200 font-mono">${person.citDate || "—"}</div>
      </div>
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04] md:col-span-2">
        <span class="text-slate-400 font-medium">Permanent Address (English)</span>
        <div class="text-sm font-semibold text-slate-200">${person.addressEn || "—"}</div>
      </div>
      <div class="space-y-1 bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04] md:col-span-2 nepali-font">
        <span class="text-slate-400 font-medium">स्थायी ठेगाना (नेपाली)</span>
        <div class="text-sm font-semibold text-slate-200">${person.addressNp || "—"}</div>
      </div>
    </div>

    <!-- Footer meta -->
    <div class="border-t border-white/10 pt-4 flex flex-wrap justify-between items-center text-[10px] text-slate-500 gap-2">
      <div>Identity Status: <span class="uppercase font-bold text-amber-500">${person.status || "pending"}</span></div>
      <div>Last Updated: <span class="font-mono">${person.updateDate || person.regDate || "—"}</span></div>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error during verification", details: err.message });
  }
};
