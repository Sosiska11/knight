import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLITHTTP_PATH = '/knight-down';
const SPLITHTTP_UPLOAD_PATH = '/knight-up';
const SPLITHTTP_HOST = 'cdn.node-ping-stat.ru';   // Production CDN domain
const SPLITHTTP_PORT = 8080;                       // Local Xray port
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

  // 2. streamSettings for SplitHTTP GET-ONLY
  const splithttpStreamSettings = {
    network: 'splithttp',
    security: 'none',
    splithttpSettings: {
      path: SPLITHTTP_PATH,
      host: SPLITHTTP_HOST,
      uploadPath: SPLITHTTP_PATH,
      uploadMethod: 'GET',
      downloadPath: SPLITHTTP_PATH,
      downloadMethod: 'GET'
    }
  };

  // 3. Payload matching the backup clients
  const payload = {
    remark: 'System Assets Inbound',
    port: SPLITHTTP_PORT,
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
        comment: 'Bypass CDN SplitHTTP profile'
      })),
      decryption: 'none',
      fallbacks: []
    }),
    streamSettings: JSON.stringify(splithttpStreamSettings),
    sniffing: JSON.stringify({ enabled: true, destOverride: ['http', 'tls'] })
  };

  // 4. Update inbound
  console.log(`\n🔧 Updating inbound ${TARGET_INBOUND_ID} (port ${SPLITHTTP_PORT}) to SplitHTTP GET-ONLY...`);
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/${TARGET_INBOUND_ID}`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });

  if (res.data && res.data.success) {
    console.log('   ✅ Inbound updated to SplitHTTP successfully!');
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
    let st; try { st = JSON.parse(ib.settings); } catch (e) {}
    console.log(`   network=${ss && ss.network} | security=${ss && ss.security}`);
    if (ss && ss.splithttpSettings) {
      console.log(`   splithttp: path=${ss.splithttpSettings.path} | uploadPath=${ss.splithttpSettings.uploadPath} | uploadMethod=${ss.splithttpSettings.uploadMethod}`);
    }
    console.log(`   clients: ${st && st.clients ? st.clients.length : 0}`);
  }

  console.log('\n✅ SplitHTTP inbound configuration complete!');
})().catch(err => {
  console.error('Error:', err.stack || err.message);
  process.exit(1);
});
