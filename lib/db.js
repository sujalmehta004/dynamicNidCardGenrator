const mongoose = require('mongoose');

let cachedConnection = global.mongooseConnection;

if (!cachedConnection) {
  cachedConnection = global.mongooseConnection = { conn: null, promise: null };
}

let cachedSecondaryConnection = global.mongooseSecondaryConnection;

if (!cachedSecondaryConnection) {
  cachedSecondaryConnection = global.mongooseSecondaryConnection = { conn: null, promise: null };
}

async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside your project settings on Vercel.');
  }

  if (cachedConnection.conn) {
    await connectToSecondaryDatabase();
    return cachedConnection.conn;
  }

  if (!cachedConnection.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
      connectTimeoutMS: 5000,
    };

    cachedConnection.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cachedConnection.conn = await cachedConnection.promise;
    await connectToSecondaryDatabase();
  } catch (e) {
    cachedConnection.promise = null;
    throw e;
  }

  return cachedConnection.conn;
}

async function connectToSecondaryDatabase() {
  const MONGODB_URI_SECOND = process.env.MONGODB_URI_SECOND || 'mongodb+srv://admin:admin123@cluster0voterlistdatani.zusuuey.mongodb.net/?appName=Cluster0VoterListDataNidQr';

  if (!MONGODB_URI_SECOND) {
    throw new Error('Please define the MONGODB_URI_SECOND environment variable inside your project settings on Vercel.');
  }

  if (cachedSecondaryConnection.conn) {
    return cachedSecondaryConnection.conn;
  }

  if (!cachedSecondaryConnection.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    };

    const secondaryConnection = mongoose.createConnection(MONGODB_URI_SECOND, opts);
    cachedSecondaryConnection.promise = secondaryConnection.asPromise().then((connection) => connection);
  }

  try {
    cachedSecondaryConnection.conn = await cachedSecondaryConnection.promise;
  } catch (e) {
    cachedSecondaryConnection.promise = null;
    throw e;
  }

  return cachedSecondaryConnection.conn;
}

module.exports = connectToDatabase;
module.exports.connectToDatabase = connectToDatabase;
module.exports.connectToSecondaryDatabase = connectToSecondaryDatabase;
