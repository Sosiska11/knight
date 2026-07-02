import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WS_PATH = '/knight-ws';
const WS_PORT = 8080;
const TARGET_INBOUND_ID = 4;

const BACKUP_FILE = path.join(__dirname, 'inbound-4-backup.json');

(async () => {
  console.log('🔑 Logging in to 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) { console.error('❌ Failed to log in.'); process.exit(1); }
  const headers = await xuiApi.getHeaders();

  // 1. Read clients from backup
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`❌ Backup file not found: ${BACKUP_FILE}`);
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  const clientsList = (backup.settings && backup.settings.clients) || [];
  console.log(`\n📋 Loaded ${clientsList.length} clients from backup:`);
  clientsList.forEach(c => console.log(`   - ${c.email} (uuid=${c.id.substring(0,8)}..., limit=${c.limitIp}, totalGB=${Math.round(c.totalGB/1073741824)}GB)`));

  // 2. streamSettings for WS
  const wsStreamSettings = {
    network: 'ws',
    security: 'none',
    wsSettings: {
      path: WS_PATH,
      headers: {}
    }
  };

  // 3. Payload matching the backup clients
  const payload = {
    remark: 'System Assets Inbound',
    port: WS_PORT,
    protocol: 'vless',
    listen: '127.0.0.1',
    enable: true,
    settings: JSON.stringify({
      clients: clientsList.map(c => ({
        id: c.id,
        flow: '',
        email: c.email,
        limitIp: c.limitIp || 1,
        totalGB: c.totalGB,
        expiryTime: c.expiryTime || 0,
        enable: c.enable !== false,
        tgId: c.tgId || 0,
        subId: c.subId || crypto.randomUUID(),
        comment: 'Bypass CDN WS profile'
      })),
      decryption: 'none',
      fallbacks: []
    }),
    streamSettings: JSON.stringify(wsStreamSettings),
    sniffing: JSON.stringify({ enabled: true, destOverride: ['http', 'tls'] })
  };

  // 4. Update inbound
  console.log(`\n🔧 Updating inbound ${TARGET_INBOUND_ID} (port ${WS_PORT}) to WebSocket...`);
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/${TARGET_INBOUND_ID}`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });

  if (res.data && res.data.success) {
    console.log('   ✅ Inbound updated to WebSocket successfully!');
  } else {
    console.error('   ❌ Update failed:', res.data && res.data.msg);
    process.exit(1);
  }

  // 5. Verification
  console.log('\n🔍 Verifying final state...');
  const verifyRes = await axios.get(`${xuiApi.baseUrl}/panel/api/inbounds/get/${TARGET_INBOUND_ID}`, { headers, timeout: 5000 });
  const ib = verifyRes.data && verifyRes.data.obj;
  if (ib) {
    let ss; try { ss = JSON.parse(ib.streamSettings); } catch (e) {}
    console.log(`   network=${ss && ss.network} | security=${ss && ss.security}`);
    if (ss && ss.wsSettings) {
      console.log(`   wsSettings: path=${ss.wsSettings.path}`);
    }
  }

  console.log('\n✅ WebSocket inbound configuration complete!');
})().catch(err => {
  console.error('Error:', err.stack || err.message);
  process.exit(1);
});
