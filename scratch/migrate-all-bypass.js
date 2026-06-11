import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import xuiApi from '../src/xui-api.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const dbPath = path.resolve(projectRoot, 'database.db');
const db = new sqlite3.Database(dbPath);

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

async function run() {
  console.log('🔑 Authenticating with 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in to 3x-ui.');
    process.exit(1);
  }

  console.log('🔍 Fetching all active subscriptions from SQLite...');
  const subs = await dbAll("SELECT * FROM subscriptions WHERE status = 'active'");
  console.log(`Found ${subs.length} active subscriptions.`);

  for (const sub of subs) {
    console.log(`\n⏳ Migrating user ${sub.tg_id} (email: ${sub.client_email})...`);
    
    // Register client in both inbounds (which now both point to Inbound 1)
    const client = await xuiApi.addClient(sub.client_email, sub.client_uuid, sub.limit_ip || 1);
    
    if (client.error) {
      console.error(`❌ Error migrating client ${sub.client_email}:`, client.error);
      continue;
    }

    // Update SQLite with the new connection URLs
    await dbRun(
      'UPDATE subscriptions SET connection_url = ?, bypass_connection_url = ? WHERE id = ?',
      [client.connectionUrl, client.bypassConnectionUrl, sub.id]
    );

    console.log(`✅ Success for ${sub.client_email}!`);
    console.log('New Main URL:', client.connectionUrl);
    console.log('New Bypass URL:', client.bypassConnectionUrl);
  }

  console.log('\n🎉 Migration completed successfully!');
  db.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Unhandled error:', err);
  db.close();
  process.exit(1);
});
