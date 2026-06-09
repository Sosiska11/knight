import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure database file path is resolved
const dbPath = path.isAbsolute(config.DATABASE_FILE)
  ? config.DATABASE_FILE
  : path.resolve(__dirname, '..', config.DATABASE_FILE);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log(`📂 SQLite database initialized at: ${dbPath}`);
  }
});

// Promisify database operations
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize tables
export async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      tg_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      trial_used INTEGER DEFAULT 0,
      balance REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER,
      client_email TEXT UNIQUE,
      client_uuid TEXT,
      connection_url TEXT,
      bypass_connection_url TEXT,
      plan_name TEXT,
      starts_at TEXT,
      expires_at TEXT,
      status TEXT DEFAULT 'active',
      warning_sent INTEGER DEFAULT 0,
      limit_ip INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tg_id) REFERENCES users(tg_id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER,
      payment_id TEXT UNIQUE,
      amount REAL,
      plan_id TEXT,
      status TEXT DEFAULT 'pending',
      invoice_message_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tg_id) REFERENCES users(tg_id)
    )
  `);
  
  // Migration: Add warning_sent column if it doesn't exist (for existing databases)
  try {
    await dbRun(`ALTER TABLE subscriptions ADD COLUMN warning_sent INTEGER DEFAULT 0`);
    console.log('📝 Added warning_sent column to subscriptions table (migration).');
  } catch (err) {
    // Ignore error if column already exists
  }

  // Migration: Add limit_ip column if it doesn't exist (for existing databases)
  try {
    await dbRun(`ALTER TABLE subscriptions ADD COLUMN limit_ip INTEGER DEFAULT 1`);
    console.log('📝 Added limit_ip column to subscriptions table (migration).');
  } catch (err) {
    // Ignore error if column already exists
  }

  // Migration: Add invoice_message_id column if it doesn't exist (for existing databases)
  try {
    await dbRun(`ALTER TABLE payments ADD COLUMN invoice_message_id INTEGER`);
    console.log('📝 Added invoice_message_id column to payments table (migration).');
  } catch (err) {
    // Ignore error if column already exists
  }

  // Migration: Add bypass_connection_url column if it doesn't exist (for existing databases)
  try {
    await dbRun(`ALTER TABLE subscriptions ADD COLUMN bypass_connection_url TEXT`);
    console.log('📝 Added bypass_connection_url column to subscriptions table (migration).');
  } catch (err) {
    // Ignore error if column already exists
  }
  
  console.log('✅ Database tables initialized successfully.');
}

// User methods
export async function getUser(tgId) {
  return await dbGet('SELECT * FROM users WHERE tg_id = ?', [tgId]);
}

export async function createUser(tgId, username, firstName) {
  try {
    await dbRun(
      'INSERT OR IGNORE INTO users (tg_id, username, first_name) VALUES (?, ?, ?)',
      [tgId, username, firstName]
    );
    // In case username or first_name changed, update them
    await dbRun(
      'UPDATE users SET username = ?, first_name = ? WHERE tg_id = ?',
      [username, firstName, tgId]
    );
    return await getUser(tgId);
  } catch (error) {
    console.error('Error in createUser:', error);
    throw error;
  }
}

export async function markTrialUsed(tgId) {
  return await dbRun('UPDATE users SET trial_used = 1 WHERE tg_id = ?', [tgId]);
}

// Subscription methods
export async function getActiveSubscription(tgId) {
  return await dbGet(
    "SELECT * FROM subscriptions WHERE tg_id = ? AND status = 'active' AND datetime(expires_at) > datetime('now')",
    [tgId]
  );
}

export async function getSubscriptionByEmail(email) {
  return await dbGet('SELECT * FROM subscriptions WHERE client_email = ?', [email]);
}

export async function getSubscriptionByUuid(uuid) {
  return await dbGet('SELECT * FROM subscriptions WHERE client_uuid = ?', [uuid]);
}

export async function createSubscription(tgId, email, uuid, connectionUrl, planName, durationDays, limitIp = 1, bypassConnectionUrl = null) {
  const startsAt = new Date().toISOString().replace('T', ' ').substring(0, 19); // YYYY-MM-DD HH:MM:SS
  const expires = new Date();
  expires.setDate(expires.getDate() + durationDays);
  const expiresAt = expires.toISOString().replace('T', ' ').substring(0, 19);

  await dbRun(
    `INSERT INTO subscriptions (tg_id, client_email, client_uuid, connection_url, bypass_connection_url, plan_name, starts_at, expires_at, status, warning_sent, limit_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)
     ON CONFLICT(client_email) DO UPDATE SET
       connection_url = excluded.connection_url,
       bypass_connection_url = excluded.bypass_connection_url,
       plan_name = excluded.plan_name,
       starts_at = excluded.starts_at,
       expires_at = excluded.expires_at,
       status = 'active',
       warning_sent = 0,
       limit_ip = excluded.limit_ip`,
    [tgId, email, uuid, connectionUrl, bypassConnectionUrl, planName, startsAt, expiresAt, limitIp]
  );

  return await getActiveSubscription(tgId);
}

export async function extendSubscription(tgId, durationDays, limitIp = null, planName = null) {
  const activeSub = await getActiveSubscription(tgId);
  if (!activeSub) {
    return null; // Must create a new subscription instead of extending
  }

  const currentExpires = new Date(activeSub.expires_at.replace(' ', 'T') + 'Z');
  currentExpires.setDate(currentExpires.getDate() + durationDays);
  const newExpiresAt = currentExpires.toISOString().replace('T', ' ').substring(0, 19);

  const newLimitIp = limitIp !== null ? limitIp : (activeSub.limit_ip || 1);

  if (planName) {
    await dbRun(
      "UPDATE subscriptions SET expires_at = ?, status = 'active', warning_sent = 0, limit_ip = ?, plan_name = ? WHERE id = ?",
      [newExpiresAt, newLimitIp, planName, activeSub.id]
    );
  } else {
    await dbRun(
      "UPDATE subscriptions SET expires_at = ?, status = 'active', warning_sent = 0, limit_ip = ? WHERE id = ?",
      [newExpiresAt, newLimitIp, activeSub.id]
    );
  }

  return await getActiveSubscription(tgId);
}

export async function updateSubscriptionUrls(tgId, connectionUrl, bypassConnectionUrl) {
  return await dbRun(
    'UPDATE subscriptions SET connection_url = ?, bypass_connection_url = ? WHERE tg_id = ? AND status = "active"',
    [connectionUrl, bypassConnectionUrl, tgId]
  );
}

// Payment methods
export async function createPayment(tgId, paymentId, amount, planId) {
  return await dbRun(
    'INSERT OR REPLACE INTO payments (tg_id, payment_id, amount, plan_id, status) VALUES (?, ?, ?, ?, ?)',
    [tgId, paymentId, amount, planId, 'pending']
  );
}

export async function updatePaymentInvoiceMessageId(paymentId, invoiceMessageId) {
  return await dbRun(
    'UPDATE payments SET invoice_message_id = ? WHERE payment_id = ?',
    [invoiceMessageId, paymentId]
  );
}

export async function completePayment(paymentId) {
  await dbRun(
    "UPDATE payments SET status = 'completed' WHERE payment_id = ?",
    [paymentId]
  );
  return await dbGet('SELECT * FROM payments WHERE payment_id = ?', [paymentId]);
}

export async function failPayment(paymentId) {
  return await dbRun(
    "UPDATE payments SET status = 'failed' WHERE payment_id = ?",
    [paymentId]
  );
}

// Cron checking methods
export async function getExpiredSubscriptions() {
  return await dbAll(
    `SELECT * FROM subscriptions 
     WHERE status = 'active' 
     AND datetime(expires_at) <= datetime('now')`
  );
}

export async function deactivateSubscription(id) {
  return await dbRun(
    "UPDATE subscriptions SET status = 'expired' WHERE id = ?",
    [id]
  );
}

export async function getExpiringSubscriptions() {
  return await dbAll(
    `SELECT * FROM subscriptions 
     WHERE status = 'active' 
     AND warning_sent = 0
     AND datetime(expires_at) <= datetime('now', '+1 day')
     AND datetime(expires_at) > datetime('now')`
  );
}

export async function markWarningSent(id) {
  return await dbRun('UPDATE subscriptions SET warning_sent = 1 WHERE id = ?', [id]);
}

// Admin / Statistics methods
export async function getStats() {
  const totalUsers = await dbGet('SELECT COUNT(*) as count FROM users');
  const activeSubscribers = await dbGet(
    "SELECT COUNT(DISTINCT tg_id) as count FROM subscriptions WHERE status = 'active' AND datetime(expires_at) > datetime('now')"
  );
  const totalEarnings = await dbGet(
    "SELECT SUM(amount) as sum FROM payments WHERE status = 'completed'"
  );

  return {
    totalUsers: totalUsers?.count || 0,
    activeSubscribers: activeSubscribers?.count || 0,
    totalEarnings: totalEarnings?.sum || 0,
  };
}

export async function getAllUsers() {
  return await dbAll(`
    SELECT u.*, s.expires_at, s.status as sub_status 
    FROM users u 
    LEFT JOIN subscriptions s ON u.tg_id = s.tg_id AND s.status = 'active'
    ORDER BY u.created_at DESC
  `);
}

export async function forceExtendUser(tgId, days) {
  const activeSub = await getActiveSubscription(tgId);
  if (activeSub) {
    return await extendSubscription(tgId, days, null, 'Выдано админом');
  } else {
    // Create new with dummy credentials or update existing expired one
    const user = await getUser(tgId);
    if (!user) return null;

    const email = `vpn_user_${tgId}`;
    const uuid = 'dummy-uuid-force-extend';
    const connectionUrl = 'vless://dummy-uuid-force-extend@your-server-ip:443?path=%2F&security=reality&encryption=none#Knight_VPN';
    return await createSubscription(tgId, email, uuid, connectionUrl, 'Admin Bonus', days);
  }
}
