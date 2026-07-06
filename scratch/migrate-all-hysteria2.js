import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import xuiApi from '../src/xui-api.js';
import config from '../src/config.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.isAbsolute(config.DATABASE_FILE)
  ? config.DATABASE_FILE
  : path.resolve(__dirname, '..', config.DATABASE_FILE);

console.log(`Connecting to database: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function run() {
  if (!config.XUI_HY2_INBOUND_ID) {
    console.error('❌ XUI_HY2_INBOUND_ID is not set in config/env. Aborting.');
    process.exit(1);
  }

  console.log('🔑 Authenticating with 3x-ui panel...');
  const loginSuccess = await xuiApi.login();
  if (!loginSuccess) {
    console.error('❌ Failed to log in to 3x-ui.');
    process.exit(1);
  }

  const headers = await xuiApi.getHeaders();
  const addClientUrl = `${xuiApi.baseUrl}/panel/api/clients/add`;

  console.log('Fetching active subscriptions from database...');
  const activeSubs = await dbAll(
    "SELECT client_email, client_uuid, limit_ip FROM subscriptions WHERE status = 'active' AND datetime(expires_at) > datetime('now')"
  );

  console.log(`Found ${activeSubs.length} active subscriptions to migrate.`);

  for (const sub of activeSubs) {
    const { client_email, client_uuid, limit_ip } = sub;
    const email = client_email;
    const uuid = client_uuid;
    const limitIp = limit_ip || 1;

    console.log(`⏳ Migrating user ${email}...`);

    // Clean up first to avoid collisions if they are already in the inbound
    try {
      const delUrl = `${xuiApi.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_hy2')}`;
      await axios.post(delUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(() => null);
    } catch (e) {}

    const hy2Payload = {
      inboundIds: [config.XUI_HY2_INBOUND_ID],
      client: {
        id: uuid,
        auth: uuid,
        password: uuid,
        email: email + '_hy2',
        limitIp: limitIp,
        totalGB: 0,
        expiryTime: 0,
        enable: true,
        tgId: 0,
        subId: '',
        comment: 'Migrated Hysteria 2 profile'
      }
    };

    try {
      const res = await axios.post(addClientUrl, hy2Payload, { headers, timeout: 10000 });
      if (res.data && res.data.success) {
        console.log(`✅ Successfully added ${email} to Hysteria 2 inbound.`);
      } else {
        console.warn(`⚠️ Failed to add ${email} to Hysteria 2 inbound: ${res.data?.msg || 'Unknown panel error'}`);
      }
    } catch (err) {
      console.error(`❌ Request error migrating ${email}:`, err.message);
    }
  }

  console.log('🏁 Migration process finished.');
  db.close();
}

run().catch(err => {
  console.error(err);
  db.close();
});
