const express = require('express');
const path = require('path');
const db = require('./db');
const users = require('./users');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/users', users.router);

app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', db: db.DB_NAME, collections: db.COLLECTIONS });
  } catch (err) {
    res.status(503).json({ status: 'no database', error: err.message });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

async function start() {
  try {
    await db.connect();
    console.log(`Connected to MongoDB → database "${db.DB_NAME}"`);
  } catch (err) {
    console.error(`Cannot reach MongoDB at ${db.SAFE_MONGO_URL}`);
    console.error(err.message);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`Profile app running at http://localhost:${PORT}`));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await db.close();
    process.exit(0);
  });
}

start();
