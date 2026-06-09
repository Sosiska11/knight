import * as db from '../src/database.js';
import xuiApi from '../src/xui-api.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const tgId = 797540993;
  console.log(`🔍 Fetching active subscription for Telegram ID: ${tgId}...`);
  
  await db.initDb();
  
  const activeSub = await db.getActiveSubscription(tgId);
  if (!activeSub) {
    console.error('❌ Active subscription not found in database for this ID.');
    process.exit(1);
  }

  console.log(`Found subscription: email=${activeSub.client_email}, uuid=${activeSub.client_uuid}`);
  console.log('🔑 Authenticating with 3x-ui...');
  
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in to 3x-ui.');
    process.exit(1);
  }

  console.log('🚀 Registering client in both inbounds...');
  const client = await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid, activeSub.limit_ip || 1);

  if (client.error) {
    console.error('❌ Error during client registration in 3x-ui:', client.error);
    process.exit(1);
  }

  console.log('📝 Saving connection URLs to SQLite...');
  await db.updateSubscriptionUrls(tgId, client.connectionUrl, client.bypassConnectionUrl);

  console.log('✅ Success!');
  console.log('Main URL:', client.connectionUrl);
  console.log('Bypass URL:', client.bypassConnectionUrl);
  process.exit(0);
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
