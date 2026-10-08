const fs = require('fs');
const { MongoClient } = require('mongodb');

// Supports the Docker secrets convention: FOO_FILE wins over FOO, so the
// password never has to appear in an environment variable or an image layer.
function secret(name, fallback) {
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return process.env[name] || fallback;
}

function buildMongoUrl() {
  if (process.env.MONGO_URL) return process.env.MONGO_URL;

  const user = encodeURIComponent(secret('MONGO_USER', 'admin'));
  const pass = encodeURIComponent(secret('MONGO_PASSWORD', 'password'));
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const authSource = process.env.MONGO_AUTH_SOURCE || 'admin';

  return `mongodb://${user}:${pass}@${host}:${port}/?authSource=${authSource}`;
}

const MONGO_URL = buildMongoUrl();
const DB_NAME = process.env.DB_NAME || 'user-account';

// Never log the password back out.
const SAFE_MONGO_URL = MONGO_URL.replace(/\/\/[^@/]*@/, '//***@');

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });

// Each key is a logical "table" -> its MongoDB collection name.
const COLLECTIONS = { users: 'users' };

const collections = {};

async function connect() {
  await client.connect();
  const db = client.db(DB_NAME);

  for (const [key, name] of Object.entries(COLLECTIONS)) {
    collections[key] = db.collection(name);
  }

  // Email is optional, but must be unique when present. Blank emails are
  // stored as a missing field so they fall outside this partial index.
  await collections.users.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
  );

  return db;
}

async function ping() {
  return client.db(DB_NAME).command({ ping: 1 });
}

async function close() {
  await client.close();
}

module.exports = { connect, ping, close, collections, DB_NAME, SAFE_MONGO_URL, COLLECTIONS };
