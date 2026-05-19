const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let clientPromise = null;
let initPromise = null;

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      createClient({
        url: getEnv('TURSO_DATABASE_URL'),
        authToken: getEnv('TURSO_AUTH_TOKEN'),
      })
    );
  }
  return clientPromise;
}

async function initSchema() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await getClient();

    await db.execute(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      price_half REAL,
      category TEXT NOT NULL,
      image TEXT
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal REAL NOT NULL,
      total REAL NOT NULL,
      cashier_name TEXT,
      status TEXT DEFAULT 'daily',
      daily_id INTEGER
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS order_items (
      order_id INTEGER,
      item_id INTEGER,
      quantity INTEGER,
      price_at_time REAL
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT
    )`);

    // Seed default users if empty
    const { rows } = await db.execute(`SELECT COUNT(*) as count FROM users`);
    const count = Number(rows?.[0]?.count || 0);
    if (count === 0) {
      const saltRounds = 10;
      const staffHash = await bcrypt.hash('staff123', saltRounds);
      const adminHash = await bcrypt.hash('admin123', saltRounds);
      await db.execute({
        sql: `INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
        args: ['staff', staffHash, 'staff', 'Ravi Kumar'],
      });
      await db.execute({
        sql: `INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
        args: ['admin', adminHash, 'admin', 'Priya Sharma'],
      });
    }
  })();

  return initPromise;
}

async function query(sql, args = []) {
  await initSchema();
  const db = await getClient();
  return db.execute({ sql, args });
}

module.exports = { query };

