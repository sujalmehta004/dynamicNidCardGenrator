const connectToDatabase = require('../lib/db');
const Person = require('../lib/models/Person');

// ─── UPDATE MODE CONSTANTS ──────────────────────────────────────────────────
//
// TOKEN-ONLY mode: triggered when the update comes from an automated process
// (PDF download, QR scan, token paste, public verify page). In this mode ONLY
// the 'token' field is written to the database. Every identity field
// (name, address, mobile, DOB, NID number, etc.) is completely immutable and
// CANNOT be changed or overwritten — not even with an empty string.
//
// MANUAL EDIT mode: triggered when an admin submits the workspace edit form.
// All fields are editable, full diff-based history is recorded, and a
// previous snapshot is saved so changes can always be reviewed.
//
// Mode is detected by the 'updateAction' field in the request body:
//   'Token Verified & Saved' (or similar) → TOKEN-ONLY
//   Anything else                         → MANUAL EDIT

const TOKEN_ONLY_ACTIONS = new Set([
  'token verified & saved',
  'token verified and saved',
]);

// All fields tracked in change history.
const TRACKED_FIELDS = [
  'ninEn', 'ninNp', 'givenEn', 'givenNp', 'surnameEn', 'surnameNp',
  'dobEn', 'dobNp', 'nationality', 'citDate', 'status', 'cardDesign',
  'addressEn', 'addressNp', 'baseUrl', 'token', 'mobile',
];

// ─── HELPERS ────────────────────────────────────────────────────────────────

function detectTokenOnly(data) {
  const action = String(data.updateAction || '').trim().toLowerCase();
  return TOKEN_ONLY_ACTIONS.has(action) || data._tokenOnly === true;
}

function diffFields(existingPerson, data) {
  const changedFields = [];
  const fieldChanges = {};
  const previousSnapshot = {};
  for (const field of TRACKED_FIELDS) {
    const oldVal = existingPerson[field] != null ? String(existingPerson[field]).trim() : '';
    previousSnapshot[field] = oldVal;
    if (data[field] != null) {
      let newVal = String(data[field]).trim();
      if (field === 'givenEn' || field === 'surnameEn' || field === 'nationality') newVal = newVal.toUpperCase();
      if (newVal !== '' && newVal !== oldVal) {
        changedFields.push(field);
        fieldChanges[field] = { from: oldVal, to: newVal };
      }
    }
  }
  return { changedFields, fieldChanges, previousSnapshot };
}

const FIELD_FRIENDLY_NAMES = {
  mobile: 'Mobile Number',
  addressEn: 'Address (EN)',
  addressNp: 'Address (NP)',
  givenEn: 'Given Name (EN)',
  surnameEn: 'Surname (EN)',
  givenNp: 'Given Name (NP)',
  surnameNp: 'Surname (NP)',
  dobEn: 'DOB (EN)',
  dobNp: 'DOB (NP)',
  nationality: 'Nationality',
  citDate: 'Citizenship Date',
  status: 'Status',
  cardDesign: 'Card Design',
  ninEn: 'NIN (EN)',
  ninNp: 'NIN (NP)',
  token: 'e-NID Token',
  baseUrl: 'Base URL',
};

function buildActionLabel(data, changedFields) {
  if (data.updateAction && data.updateAction.trim() !== '') {
    // If updateAction is passed as "Token Verified & Saved" but token is NOT among changedFields, override it!
    const isTokenAction = data.updateAction.toLowerCase().includes('token');
    const hasTokenChanged = changedFields.includes('token');
    if (!isTokenAction || hasTokenChanged) {
      return data.updateAction;
    }
  }

  if (!changedFields || changedFields.length === 0) return 'Manual Edit';

  // Single field updates
  if (changedFields.length === 1) {
    const f = changedFields[0];
    if (f === 'mobile') return 'Mobile Number Updated';
    if (f === 'status') return `Status Changed: ${data.status || 'Updated'}`;
    if (f === 'cardDesign') return `Card Design: ${data.cardDesign || 'Updated'}`;
    if (f === 'token') return 'Token Verified & Saved';
    if (f === 'addressEn' || f === 'addressNp') return 'Address Updated';
    if (f === 'givenEn' || f === 'surnameEn') return 'English Name Updated';
    if (f === 'givenNp' || f === 'surnameNp') return 'Nepali Name Updated';
    if (f === 'dobEn' || f === 'dobNp') return 'Date of Birth Updated';
    if (f === 'citDate') return 'Citizenship Date Updated';
    if (f === 'ninEn' || f === 'ninNp') return 'NIN Updated';
    const friendly = FIELD_FRIENDLY_NAMES[f] || f;
    return `${friendly} Updated`;
  }

  // Two related fields
  const set = new Set(changedFields);
  if (set.size === 2) {
    if (set.has('givenEn') && set.has('surnameEn')) return 'English Name Updated';
    if (set.has('givenNp') && set.has('surnameNp')) return 'Nepali Name Updated';
    if (set.has('addressEn') && set.has('addressNp')) return 'Address (EN & NP) Updated';
    if (set.has('dobEn') && set.has('dobNp')) return 'Date of Birth Updated';
    if (set.has('token') && set.has('status')) return 'Token Verified & Saved';
    if (set.has('token') && set.has('mobile')) return 'Token & Mobile Number Updated';
  }

  // Multiple fields with token
  if (changedFields.includes('token')) {
    const others = changedFields.filter(f => f !== 'token').map(f => FIELD_FRIENDLY_NAMES[f] || f);
    if (others.length <= 2) {
      return `Token & ${others.join(', ')} Updated`;
    }
    return `Token & Profile Updated (${others.length} fields)`;
  }

  // Multiple profile fields without token
  const labels = changedFields.map(f => FIELD_FRIENDLY_NAMES[f] || f);
  if (labels.length <= 3) {
    return `${labels.join(', ')} Updated`;
  }
  return `Profile Updated (${labels.length} fields: ${labels.slice(0, 3).join(', ')}...)`;
}

function pushHistory(existingPerson, entry) {
  if (!existingPerson.updateHistory) existingPerson.updateHistory = [];
  existingPerson.updateHistory.push(entry);
  if (existingPerson.updateHistory.length > 100) {
    existingPerson.updateHistory = existingPerson.updateHistory.slice(-100);
  }
}

function applyManualFields(existingPerson, data) {
  // Identity fields that must not be cleared with an empty string.
  const PROTECTED = new Set([
    'givenEn', 'surnameEn', 'givenNp', 'surnameNp',
    'addressEn', 'addressNp', 'mobile', 'dobEn', 'dobNp', 'ninNp',
  ]);
  // Internal / meta fields that the loop must never touch.
  const SKIP = new Set([
    '_id', 'updateHistory', 'updateAction', 'updateNote', '_tokenOnly',
    'createdAt', 'updatedAt',
  ]);
  Object.keys(data).forEach(key => {
    if (SKIP.has(key)) return;
    const val = data[key];
    const str = typeof val === 'string' ? val.trim() : '';
    // Guard: never blank-out a protected field that already has a real value.
    if (PROTECTED.has(key) && str === '') {
      const existing = existingPerson[key];
      if (existing != null && String(existing).trim() !== '') return;
    }
    if (key === 'givenEn' || key === 'surnameEn' || key === 'nationality') {
      existingPerson[key] = typeof val === 'string' ? str.toUpperCase() : val;
    } else if (typeof val === 'string') {
      existingPerson[key] = str;
    } else {
      existingPerson[key] = val;
    }
  });
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

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
  if (typeof res.send !== 'function') {
    res.send = function (d) { this.end(d); return this; };
  }

  try {
    await connectToDatabase();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const { method } = req;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  switch (method) {

    // ── GET ───────────────────────────────────────────────────────────────────
    case 'GET':
      try {
        const { query, status, regStart, regPeriod, clientDate, sortBy, sortOrder } = req.query;
        const filter = {};

        if (status && status !== 'all') filter.status = status;

        if (regPeriod && regPeriod !== 'all') {
          let baseDate = new Date();
          if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
            const [y, m, d] = clientDate.split('-').map(Number);
            baseDate = new Date(y, m - 1, d);
          }
          const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const today = fmt(baseDate);
          if (regPeriod === 'today') {
            filter.regDate = today;
          } else if (regPeriod === 'yesterday') {
            const y = new Date(baseDate); y.setDate(baseDate.getDate() - 1);
            filter.regDate = fmt(y);
          } else if (regPeriod === 'this_week') {
            const s = new Date(baseDate); s.setDate(baseDate.getDate() - baseDate.getDay());
            filter.regDate = { $gte: fmt(s), $lte: today };
          } else if (regPeriod === 'this_month') {
            filter.regDate = { $gte: `${today.substring(0, 8)}01`, $lte: today };
          } else if (regPeriod === 'this_year') {
            filter.regDate = { $gte: `${today.substring(0, 5)}01-01`, $lte: today };
          }
        } else if (regStart) {
          filter.regDate = { $gte: regStart };
        }

        if (query) {
          const re = new RegExp(query.trim(), 'i');
          filter.$or = [
            { ninEn: re }, { ninNp: re }, { givenEn: re }, { surnameEn: re },
            { givenNp: re }, { surnameNp: re }, { addressEn: re }, { addressNp: re },
          ];
        }

        let sort = {};
        if (sortBy) {
          const order = sortOrder === 'asc' ? 1 : -1;
          sort = sortBy === 'name' ? { givenEn: order, surnameEn: order } : { [sortBy]: order };
        } else {
          sort = { createdAt: -1, _id: -1 };
        }

        const list = await Person.find(filter).sort(sort);
        return res.status(200).json(list);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve records', details: err.message });
      }

    // ── POST (create new record) ──────────────────────────────────────────────
    case 'POST':
      try {
        const data = req.body;
        if (!data.ninEn || !data.givenEn || !data.surnameEn) {
          return res.status(400).json({ error: 'NIN (English), Given Name, and Surname are required fields' });
        }
        const existing = await Person.findOne({ ninEn: data.ninEn });
        if (existing) {
          return res.status(409).json({ error: `A record with NIN '${data.ninEn}' already exists in the database.` });
        }
        const newPerson = new Person(data);
        await newPerson.save();
        return res.status(201).json(newPerson);
      } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: 'Duplicate key error: This NIN is already registered.' });
        return res.status(500).json({ error: 'Failed to save record', details: err.message });
      }

    // ── PUT (update) ──────────────────────────────────────────────────────────
    case 'PUT':
      try {
        const { originalNin } = req.query;
        const data = req.body;

        if (!originalNin) {
          return res.status(400).json({ error: 'Original NIN parameter is required to update a record' });
        }

        const existingPerson = await Person.findOne({ ninEn: originalNin });
        if (!existingPerson) {
          return res.status(404).json({ error: 'Record not found to update' });
        }

        const tokenOnly = detectTokenOnly(data);

        // ══════════════════════════════════════════════════════════════════════
        // TOKEN-ONLY MODE
        // ─ Triggered by: PDF download, QR scan, token paste, public verify page
        // ─ ONLY 'token' field is written to the database
        // ─ ALL other fields are completely ignored — they cannot be overwritten
        // ─ Status is auto-set to 'done' when a valid token is saved
        // ══════════════════════════════════════════════════════════════════════
        if (tokenOnly) {
          const newToken = typeof data.token === 'string' ? data.token.trim() : '';
          if (!newToken) {
            return res.status(400).json({ error: 'Token-only update requires a non-empty token value.' });
          }

          const oldToken = String(existingPerson.token || '').trim();
          const tokenChanged = newToken !== oldToken;

          if (tokenChanged) {
            pushHistory(existingPerson, {
              updatedAt: new Date(),
              updateDate: data.updateDate || new Date().toISOString().split('T')[0],
              action: 'Token Verified & Saved',
              note: data.updateNote || 'Token updated from scanned/extracted PDF QR code',
              changedFields: ['token'],
              changes: { token: { from: oldToken, to: newToken } },
              snapshot: {
                ninEn: String(existingPerson.ninEn || ''),
                givenEn: String(existingPerson.givenEn || ''),
                surnameEn: String(existingPerson.surnameEn || ''),
                givenNp: String(existingPerson.givenNp || ''),
                surnameNp: String(existingPerson.surnameNp || ''),
                mobile: String(existingPerson.mobile || ''),
                addressEn: String(existingPerson.addressEn || ''),
                token: oldToken,
                status: String(existingPerson.status || ''),
              },
            });

            // STRICT: only write the token field
            existingPerson.token = newToken;
          }

          // Always stamp status=done and updateDate when a valid token is saved
          existingPerson.status = 'done';
          existingPerson.updateDate = data.updateDate || new Date().toISOString().split('T')[0];

          await existingPerson.save();
          return res.status(200).json({ ...existingPerson.toObject(), _updateMode: 'token-only', _tokenChanged: tokenChanged });
        }

        // ══════════════════════════════════════════════════════════════════════
        // MANUAL EDIT MODE
        // ─ Triggered by: admin form workspace submissions
        // ─ All fields are editable
        // ─ Full diff-based history is always recorded before changes are applied
        // ─ Identity fields cannot be cleared with empty strings (must supply a
        //   real replacement value)
        // ══════════════════════════════════════════════════════════════════════

        // Guard against NIN collision when changing NID number
        if (data.ninEn && data.ninEn !== originalNin) {
          const duplicate = await Person.findOne({ ninEn: data.ninEn });
          if (duplicate) {
            return res.status(409).json({ error: `Cannot update. NIN '${data.ninEn}' is already assigned to another record.` });
          }
        }

        // Compute field diff and record history
        const { changedFields, fieldChanges, previousSnapshot } = diffFields(existingPerson, data);

        if (changedFields.length > 0) {
          pushHistory(existingPerson, {
            updatedAt: new Date(),
            updateDate: data.updateDate || new Date().toISOString().split('T')[0],
            action: buildActionLabel(data, changedFields),
            note: data.updateNote || `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
            changedFields,
            changes: fieldChanges,
            snapshot: previousSnapshot,
          });
        }

        // Apply changes with empty-string protection on identity fields
        applyManualFields(existingPerson, data);

        existingPerson.updateDate = data.updateDate || new Date().toISOString().split('T')[0];

        await existingPerson.save();
        return res.status(200).json({ ...existingPerson.toObject(), _updateMode: 'manual' });

      } catch (err) {
        return res.status(500).json({ error: 'Failed to update record', details: err.message });
      }

    // ── DELETE ────────────────────────────────────────────────────────────────
    case 'DELETE':
      try {
        const { nin } = req.query;
        if (!nin) return res.status(400).json({ error: 'NIN parameter is required for deletion' });
        const deleted = await Person.findOneAndDelete({ ninEn: nin });
        if (!deleted) return res.status(404).json({ error: 'Record not found' });
        return res.status(200).json({ message: 'Record deleted successfully', deleted });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to delete record', details: err.message });
      }

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      return res.status(405).json({ error: `Method ${method} Not Allowed` });
  }
};



