const connectToDatabase = require('./db');
const Person = require('./models/Person');

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
    console.error('Database connection error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const { method } = req;

  // Set standard response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    return res.status(200).end();
  }

  switch (method) {
    case 'GET':
      try {
        const { query, status, regStart, regPeriod, clientDate, sortBy, sortOrder } = req.query;
        const filter = {};

        // Apply filters matching the frontend console
        if (status && status !== 'all') {
          filter.status = status;
        }

        if (regPeriod && regPeriod !== 'all') {
          let baseDate = new Date();
          if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
            const [y, m, d] = clientDate.split('-').map(Number);
            baseDate = new Date(y, m - 1, d);
          }

          const formatDate = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
          };

          const todayStr = formatDate(baseDate);

          if (regPeriod === 'today') {
            filter.regDate = todayStr;
          } else if (regPeriod === 'yesterday') {
            const yesterdayDate = new Date(baseDate);
            yesterdayDate.setDate(baseDate.getDate() - 1);
            filter.regDate = formatDate(yesterdayDate);
          } else if (regPeriod === 'this_week') {
            const startOfWeek = new Date(baseDate);
            const day = baseDate.getDay();
            startOfWeek.setDate(baseDate.getDate() - day);
            filter.regDate = { $gte: formatDate(startOfWeek), $lte: todayStr };
          } else if (regPeriod === 'this_month') {
            const startOfMonthStr = `${todayStr.substring(0, 8)}01`;
            filter.regDate = { $gte: startOfMonthStr, $lte: todayStr };
          } else if (regPeriod === 'this_year') {
            const startOfYearStr = `${todayStr.substring(0, 5)}01-01`;
            filter.regDate = { $gte: startOfYearStr, $lte: todayStr };
          }
        } else if (regStart) {
          filter.regDate = { $gte: regStart };
        }

        if (query) {
          const searchRegex = new RegExp(query.trim(), 'i');
          filter.$or = [
            { ninEn: searchRegex },
            { ninNp: searchRegex },
            { givenEn: searchRegex },
            { surnameEn: searchRegex },
            { givenNp: searchRegex },
            { surnameNp: searchRegex },
            { addressEn: searchRegex },
            { addressNp: searchRegex }
          ];
        }

        let sortOption = {};
        if (sortBy) {
          const order = sortOrder === 'asc' ? 1 : -1;
          if (sortBy === 'name') {
            sortOption = { givenEn: order, surnameEn: order };
          } else {
            sortOption[sortBy] = order;
          }
        } else {
          // Default: show the last entry (newest) at the top
          sortOption = { createdAt: -1, _id: -1 };
        }

        const list = await Person.find(filter).sort(sortOption);
        return res.status(200).json(list);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve records', details: err.message });
      }

    case 'POST':
      try {
        const data = req.body;
        if (!data.ninEn || !data.givenEn || !data.surnameEn) {
          return res.status(400).json({ error: 'NIN (English), Given Name, and Surname are required fields' });
        }

        // Check if NIN already exists
        const existing = await Person.findOne({ ninEn: data.ninEn });
        if (existing) {
          return res.status(409).json({ error: `A record with NIN '${data.ninEn}' already exists in the database.` });
        }

        const newPerson = new Person(data);
        await newPerson.save();
        return res.status(201).json(newPerson);
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({ error: 'Duplicate key error: This NIN is already registered.' });
        }
        return res.status(500).json({ error: 'Failed to save record', details: err.message });
      }

    case 'PUT':
      try {
        const { originalNin } = req.query;
        const data = req.body;

        if (!originalNin) {
          return res.status(400).json({ error: 'Original NIN parameter is required to update a record' });
        }

        // If the NIN is being changed, check for uniqueness of the new NIN
        if (data.ninEn && data.ninEn !== originalNin) {
          const duplicate = await Person.findOne({ ninEn: data.ninEn });
          if (duplicate) {
            return res.status(409).json({ error: `Cannot update. NIN '${data.ninEn}' is already assigned to another record.` });
          }
        }

        const updatedPerson = await Person.findOneAndUpdate(
          { ninEn: originalNin },
          data,
          { new: true, runValidators: true }
        );

        if (!updatedPerson) {
          return res.status(404).json({ error: 'Record not found to update' });
        }

        return res.status(200).json(updatedPerson);
      } catch (err) {
        return res.status(550).json({ error: 'Failed to update record', details: err.message });
      }

    case 'DELETE':
      try {
        const { nin } = req.query;
        if (!nin) {
          return res.status(400).json({ error: 'NIN parameter is required for deletion' });
        }

        const deleted = await Person.findOneAndDelete({ ninEn: nin });
        if (!deleted) {
          return res.status(404).json({ error: 'Record not found' });
        }

        return res.status(200).json({ message: 'Record deleted successfully', deleted });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to delete record', details: err.message });
      }

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      return res.status(405).json({ error: `Method ${method} Not Allowed` });
  }
};
