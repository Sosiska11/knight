import xuiApi from '../src/xui-api.js';
import axios from 'axios';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';

function getBypassUuid(mainUuid) {
  const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

(async () => {
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('3x-ui login failed');
    process.exit(1);
  }
  const headers = await xuiApi.getHeaders();
  const res = await axios.get(`${xuiApi.baseUrl}/panel/api/inbounds/get/4`, { headers, timeout: 10000 });
  const inbound = res.data?.obj;
  if (!inbound) {
    console.error('Inbound 4 not found');
    process.exit(1);
  }
  const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
  const xuiClients = settings?.clients || [];

  const db = new sqlite3.Database('/root/knight-vpn-bot/database.db');
  db.all('SELECT client_email, client_uuid FROM subscriptions WHERE status=\'active\'', (err, rows) => {
    if (err) {
      console.error('Database query error:', err);
      db.close();
      process.exit(1);
    }

    console.log('=== Comparing DB Bypass UUIDs vs XUI Client UUIDs ===');
    rows.forEach(row => {
      const expectedBypassUuid = getBypassUuid(row.client_uuid);
      const emailCdn = row.client_email + '_cdn';
      const xuiClient = xuiClients.find(c => c.email === emailCdn);
      
      if (xuiClient) {
        const match = xuiClient.id === expectedBypassUuid;
        console.log(`User: ${row.client_email}`);
        console.log(`  - DB Main UUID: ${row.client_uuid}`);
        console.log(`  - Expected Bypass UUID: ${expectedBypassUuid}`);
        console.log(`  - XUI Client UUID:      ${xuiClient.id}`);
        console.log(`  - Match: ${match ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log(`User: ${row.client_email} -> ❌ NOT FOUND in XUI Inbound 4 under email ${emailCdn}`);
      }
    });
    db.close();
  });
})();
