const { connectToSecondaryDatabase } = require('../lib/db');

function normalizeAddressFields(profileData = {}) {
  const distId = parseInt(profileData.PermanentDistrict || profileData.DistrictCode || 0, 10);
  const muniId = parseInt(profileData.PermanentVdcMunicipality || 0, 10);
  const provId = String(profileData.PermanentState || profileData.ProvinceCode || "");

  const PROVINCES = {
    "1": { en: "Koshi", np: "कोशी" },
    "2": { en: "Madhesh", np: "मधेश" },
    "3": { en: "Bagmati", np: "बागमती" },
    "4": { en: "Gandaki", np: "गण्डकी" },
    "5": { en: "Lumbini", np: "लुम्बिनी" },
    "6": { en: "Karnali", np: "कर्णाली" },
    "7": { en: "Sudurpashchim", np: "सुदूरपश्चिम" }
  };

  const NEPAL_DISTRICTS_MAP = {
    1: "Taplejung", 2: "Panchthar", 3: "Ilam", 4: "Jhapa", 5: "Morang",
    6: "Sunsari", 7: "Dhankuta", 8: "Terhathum", 9: "Sankhuwasabha", 10: "Bhojpur",
    11: "Solukhumbu", 12: "Okhaldhunga", 13: "Khotang", 14: "Udayapur", 15: "Saptari",
    16: "Siraha", 17: "Dhanusa", 18: "Mahottari", 19: "Sarlahi", 20: "Sindhuli",
    21: "Ramechhap", 22: "Dolakha", 23: "Sindhupalchok", 24: "Kavrepalanchok", 25: "Lalitpur",
    26: "Bhaktapur", 27: "Kathmandu", 28: "Nuwakot", 29: "Rasuwa", 30: "Dhading",
    31: "Makwanpur", 32: "Rautahat", 33: "Bara", 34: "Parsa", 35: "Chitwan",
    36: "Gorkha", 37: "Lamjung", 38: "Tanahu", 39: "Syangja", 40: "Kaski",
    41: "Manang", 42: "Mustang", 43: "Myagdi", 44: "Parbat", 45: "Baglung",
    46: "Gulmi", 47: "Palpa", 48: "Nawalparasi West", 49: "Rupandehi", 50: "Kapilbastu",
    51: "Arghakhanchi", 52: "Pyuthan", 53: "Rolpa", 54: "Rukum East", 55: "Salyan",
    56: "Dang", 57: "Banke", 58: "Bardiya", 59: "Surkhet", 60: "Dailekh",
    61: "Jajarkot", 62: "Dolpa", 63: "Jumla", 64: "Kalikot", 65: "Mugu",
    66: "Humla", 67: "Bajura", 68: "Bajhang", 69: "Achham", 70: "Doti",
    71: "Kailali", 72: "Kanchanpur", 73: "Dadeldhura", 74: "Baitadi", 75: "Darchula",
    76: "Nawalparasi East", 77: "Rukum West"
  };

  const provInfo = PROVINCES[provId] || { en: `Province ${provId}`, np: `प्रदेश ${provId}` };
  const districtEn = profileData.PermanentDistrictNameEn || (distId && NEPAL_DISTRICTS_MAP[distId] ? NEPAL_DISTRICTS_MAP[distId] : "");
  const districtNp = profileData.PermanentDistrictNameNp || "";
  const muniEn = profileData.PermanentVdcMunicipalityNameEn || (muniId ? String(muniId) : "");
  const muniNp = profileData.PermanentVdcMunicipalityNameNp || "";

  return {
    provinceEn: provInfo.en,
    provinceNp: provInfo.np,
    districtEn: districtEn || "—",
    districtNp: districtNp || "—",
    municipalityEn: muniEn || "—",
    municipalityNp: muniNp || "—",
    ward: profileData.PermanentWardLoc || profileData.PermanentWard || "",
    tole: profileData.PermanentVillageTol || profileData.PermanentVillageTolLoc || ""
  };
}

function shouldMarkRecordActive({ status = 'pending', voterListNumber = '', profileData = {}, rawPayload = {} } = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedVoterListNumber = String(voterListNumber || '').trim();
  const sourceMessage = String(
    profileData?.ApprovalMessage || profileData?.Approvalmessage || profileData?.ApprovalMassage || profileData?.message || profileData?.error ||
    rawPayload?.ApprovalMessage || rawPayload?.message || rawPayload?.error || ''
  ).trim();
  const lower = sourceMessage.toLowerCase();

  if (normalizedStatus === 'active' || normalizedVoterListNumber) return true;
  if (!sourceMessage) return false;

  if (/(not found|data not found|not active|request timed out|failed to fetch|temporarily|try again|server|network error)/i.test(sourceMessage)) {
    return false;
  }

  if (/(स्वीकृत|मतदाता|नामावलीमा दर्ता|दर्ता भइसकेको|already registered|already exists|approved|verified|active)/i.test(sourceMessage) && !/not active/i.test(sourceMessage)) {
    return true;
  }

  const hasProfileData = Boolean(profileData && typeof profileData === 'object' && Object.keys(profileData).length > 0);
  return Boolean(hasProfileData && !/(not found|data not found|not active|request timed out|failed to fetch|temporarily|try again|server|network error)/i.test(lower));
}

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

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow GET to fetch saved voter list records (single by nidNumber or all)
  if (req.method === 'GET') {
    try {
      await connectToSecondaryDatabase();
      const VoterListRecord = require('../lib/models/VoterListRecord');
      const Model = await VoterListRecord();

      const urlObj = new URL(req.url || '', 'http://localhost');
      const nidNumber = urlObj.searchParams.get('nidNumber');

      if (nidNumber) {
        const trimmed = String(nidNumber).trim();
        const digits = trimmed.replace(/[^0-9]/g, '');
        const queryOr = [{ nidNumber: trimmed }];
        if (digits) {
          queryOr.push({ nidNumber: digits });
          queryOr.push({ nidNumber: new RegExp(digits.split('').join('[- ]?'), 'i') });
        }
        const found = await Model.findOne({ $or: queryOr }).lean();
        if (!found) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ found });
      }

      const all = await Model.find({}).lean();
      return res.status(200).json({ records: all });
    } catch (err) {
      console.error('save-voter-list-record GET error', err);
      return res.status(500).json({ error: 'Failed to fetch records', details: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await connectToSecondaryDatabase();
    const { nidNumber, portraitImage = '', profileData = {}, rawPayload = {}, status = 'pending', voterListNumber = '' } = req.body || {};

    if (!nidNumber || String(nidNumber).trim() === '') {
      return res.status(400).json({ error: 'nidNumber is required' });
    }

    const VoterListRecord = require('../lib/models/VoterListRecord');
    const Model = await VoterListRecord();

    const cleanNid = String(nidNumber).trim();
    const existing = await Model.findOne({ nidNumber: cleanNid }).lean();
    const addressInfo = normalizeAddressFields(profileData);

    const existingHasDetails = Boolean(existing && (existing.portraitImage || (existing.profileData && (existing.profileData.VoterFirstNameEn || existing.profileData.FirstName || existing.profileData.Dob))));
    const incomingHasDetails = Boolean(profileData && (profileData.VoterFirstNameEn || profileData.FirstName || profileData.PortraitImage || profileData.Dob));

    let nextStatus = String(status || (existing && existing.status) || 'pending').trim() || 'pending';
    // If existing record was active or has portrait/details, and incoming has no details and is not online, preserve active status!
    if (existing && (existing.isActive || existing.status === 'active' || existingHasDetails) && nextStatus !== 'active' && !incomingHasDetails) {
      nextStatus = 'active';
    }

    const nextVoterListNumber = String(voterListNumber || (existing && existing.voterListNumber) || '').trim();

    // Preserve existing real details if incoming is just an error message
    const baseProfile = (existingHasDetails && !incomingHasDetails)
      ? { ...(existing.profileData || {}) }
      : { ...(existing?.profileData || {}), ...profileData };

    const nextProfileData = {
      ...baseProfile,
      ...addressInfo,
      ProvinceNameEn: addressInfo.provinceEn,
      ProvinceNameNp: addressInfo.provinceNp,
      DistrictNameEn: addressInfo.districtEn,
      DistrictNameNp: addressInfo.districtNp,
      MunicipalityNameEn: addressInfo.municipalityEn,
      MunicipalityNameNp: addressInfo.municipalityNp,
      WardName: addressInfo.ward || (baseProfile.PermanentWard || baseProfile.PermanentWardLoc || ''),
      ToleName: addressInfo.tole || (baseProfile.PermanentVillageTol || baseProfile.PermanentVillageTolLoc || '')
    };

    const nextPortraitImage = String(portraitImage || (profileData && profileData.PortraitImage) || (existing && existing.portraitImage) || '');

    const recordData = {
      nidNumber: cleanNid,
      portraitImage: nextPortraitImage,
      status: nextStatus,
      voterListNumber: nextVoterListNumber,
      isActive: shouldMarkRecordActive({ status: nextStatus, voterListNumber: nextVoterListNumber, profileData: nextProfileData, rawPayload }),
      profileData: nextProfileData,
      rawPayload: Object.keys(rawPayload || {}).length > 0 ? rawPayload : (existing?.rawPayload || rawPayload)
    };

    const created = existing
      ? await Model.findOneAndUpdate({ nidNumber: cleanNid }, { $set: recordData }, { new: true, upsert: true, setDefaultsOnInsert: true })
      : await Model.create(recordData);

    return res.status(existing ? 200 : 201).json({ message: existing ? 'record updated' : 'record created', created: !existing, record: created, existing: Boolean(existing) });
  } catch (error) {
    console.error('save-voter-list-record error', error);
    return res.status(500).json({ error: 'Failed to save voter list record', details: error.message });
  }
};
