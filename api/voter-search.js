const https = require('https');

function makeRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false,
    };

    const req = https.request(reqOptions, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString()
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function extractVoterJsonObject(html) {
  const marker = "newEnrollmentController(";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const startIdx = html.indexOf('{', markerIdx);
  if (startIdx === -1) return null;

  let braceCount = 0;
  for (let i = startIdx; i < html.length; i++) {
    if (html[i] === '{') {
      braceCount++;
    } else if (html[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        const jsonStr = html.substring(startIdx, i + 1);
        try {
          return new Function(`return ${jsonStr}`)();
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

// Province names (province IDs 1-7 are stable and hardcoded)
const NEPAL_PROVINCES = {
  "1": { en: "Koshi",          np: "कोशी" },
  "2": { en: "Madhesh",        np: "मधेश" },
  "3": { en: "Bagmati",        np: "बागमती" },
  "4": { en: "Gandaki",        np: "गण्डकी" },
  "5": { en: "Lumbini",        np: "लुम्बिनी" },
  "6": { en: "Karnali",        np: "कर्णाली" },
  "7": { en: "Sudurpashchim",  np: "सुदूरपश्चिम" },
};

// Nepali district name → English name lookup
// Used because the election portal only returns Nepali district names
const DISTRICT_NP_TO_EN = {
  "ताप्लेजुङ":"Taplejung","पाँचथर":"Panchthar","इलाम":"Ilam","झापा":"Jhapa",
  "मोरङ":"Morang","सुनसरी":"Sunsari","धनकुटा":"Dhankuta","तेह्रथुम":"Terhathum",
  "सङ्खुवासभा":"Sankhuwasabha","भोजपुर":"Bhojpur","सोलुखुम्बु":"Solukhumbu",
  "ओखलढुंगा":"Okhaldhunga","खोटाङ":"Khotang","उदयपुर":"Udayapur",
  "सप्तरी":"Saptari","सिरहा":"Siraha","धनुषा":"Dhanusa","महोत्तरी":"Mahottari",
  "सर्लाही":"Sarlahi","सिन्धुली":"Sindhuli","रामेछाप":"Ramechhap","दोलखा":"Dolakha",
  "सिन्धुपाल्चोक":"Sindhupalchok","काभ्रेपलान्चोक":"Kavrepalanchok",
  "ललितपुर":"Lalitpur","भक्तपुर":"Bhaktapur","काठमाडौं":"Kathmandu",
  "नुवाकोट":"Nuwakot","रसुवा":"Rasuwa","धादिङ":"Dhading","मकवानपुर":"Makwanpur",
  "रौतहट":"Rautahat","बारा":"Bara","पर्सा":"Parsa","चितवन":"Chitwan",
  "गोर्खा":"Gorkha","लमजुङ":"Lamjung","तनहुँ":"Tanahu","स्याङ्जा":"Syangja",
  "कास्की":"Kaski","मनाङ":"Manang","मुस्ताङ":"Mustang","म्याग्दी":"Myagdi",
  "पर्वत":"Parbat","बाग्लुङ":"Baglung","गुल्मी":"Gulmi","पाल्पा":"Palpa",
  "नवलपरासी":"Nawalparasi","रुपन्देही":"Rupandehi","कपिलवस्तु":"Kapilbastu",
  "अर्घाखाँची":"Arghakhanchi","प्युठान":"Pyuthan","रोल्पा":"Rolpa",
  "रुकुम":"Rukum","सल्यान":"Salyan","दाङ":"Dang","बाँके":"Banke",
  "बर्दिया":"Bardiya","सुर्खेत":"Surkhet","दैलेख":"Dailekh","जाजरकोट":"Jajarkot",
  "डोल्पा":"Dolpa","जुम्ला":"Jumla","कालिकोट":"Kalikot","मुगु":"Mugu",
  "हुम्ला":"Humla","बाजुरा":"Bajura","बझाङ":"Bajhang","अछाम":"Achham",
  "डोटी":"Doti","कैलाली":"Kailali","कञ्चनपुर":"Kanchanpur","डडेल्धुरा":"Dadeldhura",
  "बैतडी":"Baitadi","दार्चुला":"Darchula",
};



module.exports = async (req, res) => {
  if (typeof res.status !== 'function') {
    res.status = function (s) { this.statusCode = s; return this; };
  }
  if (typeof res.json !== 'function') {
    res.json = function (d) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(d));
      return this;
    };
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { nin, dob, firstname } = req.body;
  if (!nin || !dob || !firstname) {
    return res.status(400).json({ error: "Missing required body parameters (nin, dob, firstname)" });
  }

  let formattedNin = nin.replace(/[^0-9]/g, "");
  if (formattedNin.length === 10) {
    formattedNin = `${formattedNin.slice(0,3)}-${formattedNin.slice(3,6)}-${formattedNin.slice(6,9)}-${formattedNin.slice(9)}`;
  } else {
    formattedNin = nin.trim();
  }

  const formattedDob = dob.replace(/\//g, "-").trim();
  const formattedFirstname = firstname.toLowerCase().trim();

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

  try {
    // Step 1: Get session cookie
    const step1 = await makeRequest('https://applyvr.election.gov.np/Login/Preregistration/EnterMobileNo', {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    });

    const setCookie = step1.headers['set-cookie'];
    if (!setCookie) return res.status(500).json({ error: "Failed to obtain session from election portal" });

    const sessionCookieMatch = setCookie.join('; ').match(/\.AdventureWorks\.Session=[^;]+/);
    if (!sessionCookieMatch) return res.status(500).json({ error: "Failed to parse session cookie" });
    const sessionCookie = sessionCookieMatch[0];

    const authHeaders = {
      'Cookie': sessionCookie,
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
    };

    // Step 2: POST GetFromNIN
    const step2 = await makeRequest(
      `https://applyvr.election.gov.np/Login/GetFromNIN?NIN=${encodeURIComponent(formattedNin)}&dob=${encodeURIComponent(formattedDob)}&firstname=${encodeURIComponent(formattedFirstname)}`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Length': '0', 'Origin': 'https://applyvr.election.gov.np', 'Referer': 'https://applyvr.election.gov.np/Login/Preregistration/EnterMobileNo' }
      }
    );

    let step2Json;
    try { step2Json = JSON.parse(step2.body); }
    catch (e) { return res.status(500).json({ error: "Invalid response from GetFromNIN", details: step2.body }); }

    if (!step2Json.data || step2Json.status !== 1) {
      return res.status(404).json({ error: step2Json.message || "Record not found or verification failed." });
    }

    // Step 3: GET NewEnrollment dashboard page
    const step3 = await makeRequest('https://applyvr.election.gov.np/Dashboard/NewEnrollment', {
      method: 'GET',
      headers: { 'Cookie': sessionCookie, 'User-Agent': UA, 'Referer': 'https://applyvr.election.gov.np/Login/Preregistration/EnterMobileNo' }
    });

    const parsedData = extractVoterJsonObject(step3.body);
    if (!parsedData) return res.status(500).json({ error: "Failed to extract voter information from dashboard page" });

    // ── Province ─────────────────────────────────────────────────────────────
    const provId = String(parsedData.ProvinceId || parsedData.ProvinceCode || parsedData.PermanentState || "");
    const provInfo = NEPAL_PROVINCES[provId] || { en: `Province ${provId}`, np: `प्रदेश ${provId}` };
    parsedData.PermanentStateNameEn = provInfo.en;
    parsedData.PermanentStateNameNp = provInfo.np;

    // ── District ─────────────────────────────────────────────────────────────
    // Portal uses DistrictId (e.g. 10 = Sunsari) — NOT the standard 1-77 geographic numbering
    const distId = parseInt(parsedData.DistrictId || parsedData.DistrictCode || parsedData.PermanentDistrict || 0, 10);

    if (distId && provId) {
      try {
        // Fetch from portal using the LIVE session (still valid right after NewEnrollment)
        const distRes = await makeRequest(
          `https://applyvr.election.gov.np/Api/RegistrationApi/GetDistrictByProvince?provinceId=${provId}`,
          { method: 'GET', headers: { ...authHeaders, 'Referer': 'https://applyvr.election.gov.np/Dashboard/NewEnrollment' } }
        );
        const distBody = JSON.parse(distRes.body);
        // Response format: { data: [{id, name, code}], status:1 }
        // The "name" field is Nepali only (e.g. "सुनसरी")
        const distList = Array.isArray(distBody) ? distBody : (distBody.data || []);
        const distMatch = distList.find(d => String(d.id || "") === String(distId));
        if (distMatch) {
          const distNameNp = distMatch.name || "";   // e.g. "सुनसरी"
          parsedData.PermanentDistrictNameNp = distNameNp;
          // Resolve English name via our Nepali→English lookup
          parsedData.PermanentDistrictNameEn = DISTRICT_NP_TO_EN[distNameNp] || distNameNp;
        }
      } catch (e) {
        console.error("District API error:", e.message);
      }
    }

    // ── Municipality ─────────────────────────────────────────────────────────
    // Portal uses VdcMunicipalityId (e.g. 5093)
    // Response format: { data: [{id, name, code}], status:1 }
    // "name" is Nepali with suffix already included (e.g. "इनरुवा नगरपालिका")
    const muniId = parseInt(parsedData.VdcMunicipalityId || parsedData.PermanentVdcMunicipality || 0, 10);

    if (muniId && distId) {
      try {
        const muniRes = await makeRequest(
          `https://applyvr.election.gov.np/Api/RegistrationApi/GetMunicipalities?DistrictId=${distId}`,
          { method: 'GET', headers: { ...authHeaders, 'Referer': 'https://applyvr.election.gov.np/Dashboard/NewEnrollment' } }
        );
        const muniBody = JSON.parse(muniRes.body);
        const muniList = Array.isArray(muniBody) ? muniBody : (muniBody.data || []);
        const muniMatch = muniList.find(m => String(m.id || "") === String(muniId));

        if (muniMatch) {
          // Portal returns Nepali full name with suffix (e.g. "इनरुवा नगरपालिका")
          const muniNameNp = muniMatch.name || "";
          parsedData.PermanentVdcMunicipalityNameNp = muniNameNp;

          // Detect type suffix to get English equivalent
          const MUNI_SUFFIX_MAP = [
            { np: "महानगरपालिका",   en: "Metropolitan City" },
            { np: "उपमहानगरपालिका", en: "Sub-Metropolitan City" },
            { np: "नगरपालिका",      en: "Municipality" },
            { np: "गाउँपालिका",     en: "Rural Municipality" },
          ];
          let muniTypeEn = "";
          for (const { np, en } of MUNI_SUFFIX_MAP) {
            if (muniNameNp.endsWith(np)) {
              muniTypeEn = en;
              parsedData._muniCode    = muniMatch.code || "";  // e.g. "10-2"
              parsedData._muniTypeEn  = en;
              parsedData._muniTypeNp  = np;
              break;
            }
          }

          // Try to get English name from GitHub open dataset by matching the VdcMunicipalityCode
          // The code format is "distId-localIdx" (e.g. "10-2")
          let muniNameEn = "";
          try {
            const ghRes = await makeRequest(
              'https://raw.githubusercontent.com/bibekoli/local-levels-of-nepal-dataset/main/local_levels.json',
              { method: 'GET', headers: { 'User-Agent': 'NID-Portal/1.0' } }
            );
            const localLevels = JSON.parse(ghRes.body);
            // Match by Nepali name (strip the type suffix to get base name)
            let baseNp = muniNameNp;
            for (const { np } of MUNI_SUFFIX_MAP) {
              if (baseNp.endsWith(np)) { baseNp = baseNp.slice(0, -np.length).trim(); break; }
            }
            // Find by nepali_name match (base without suffix)
            const found = localLevels.find(m =>
              m.nepali_name && (m.nepali_name === baseNp || m.nepali_name === muniNameNp)
            );
            if (found && found.name) {
              muniNameEn = found.name + (muniTypeEn ? " " + muniTypeEn : "");
            }
          } catch (e) {
            // GitHub fetch failed — fall back to Nepali name
          }

          parsedData.PermanentVdcMunicipalityNameEn = muniNameEn || muniNameNp;
        }
      } catch (e) {
        console.error("Municipality API error:", e.message);
      }
    }

    // Ward
    if (parsedData.WardNo !== undefined && parsedData.WardNo !== null) {
      parsedData.PermanentWard = String(parsedData.WardNo || "");
    }

    // Normalise canonical IDs for the frontend
    parsedData.PermanentDistrict = distId;
    parsedData.PermanentVdcMunicipality = muniId;
    parsedData.PermanentState = provId;

    return res.status(200).json({ success: true, data: parsedData });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error during voter search proxy", details: err.message });
  }
};
