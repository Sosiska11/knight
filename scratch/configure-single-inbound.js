import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import * as db from '../src/database.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

function getBypassUuid(mainUuid) {
  const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

async function run() {
  console.log('🔑 Logging in to 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in.');
    return;
  }

  const headers = await xuiApi.getHeaders();
  console.log('Fetching inbound 1...');
  const inbound1 = await xuiApi.getInbound(1);
  if (!inbound1) {
    console.error('❌ Inbound 1 not found.');
    return;
  }

  const settingsObj = typeof inbound1.settings === 'string'
    ? JSON.parse(inbound1.settings)
    : inbound1.settings;

  // 1. Remove the fallbacks from Inbound 1 settings
  if (settingsObj.fallbacks) {
    delete settingsObj.fallbacks;
    console.log('🗑️ Removed fallbacks from settings.');
  }

  // 2. Restore all serverNames in Inbound 1 Reality settings
  const streamSettings = typeof inbound1.streamSettings === 'string'
    ? JSON.parse(inbound1.streamSettings)
    : inbound1.streamSettings;

  if (streamSettings.realitySettings) {
    streamSettings.realitySettings.serverNames = [
      "google.com",
      "speedtest.net",
      "microsoft.com",
      "samsung.com",
      "apple.com",
      "yandex.ru",
      "gosuslugi.ru",
      "sberbank.ru",
      "vk.com"
    ];
    console.log('✅ Restored serverNames in Reality settings.');
  }

  const payload = {
    remark: inbound1.remark,
    port: inbound1.port,
    protocol: inbound1.protocol,
    listen: inbound1.listen,
    enable: inbound1.enable,
    settings: JSON.stringify(settingsObj),
    streamSettings: JSON.stringify(streamSettings),
    sniffing: typeof inbound1.sniffing === 'object' ? JSON.stringify(inbound1.sniffing) : inbound1.sniffing
  };

  console.log('Updating inbound 1 settings...');
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/1`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });
  console.log('Inbound 1 Update Response:', res.data);

  // 3. Register the active user in Inbound 1 with the deterministic bypass UUID
  console.log('Initializing local DB...');
  await db.initDb();
  const activeSub = await db.getActiveSubscription(797540993);
  if (activeSub) {
    const mainUuid = activeSub.client_uuid;
    const bypassUuid = getBypassUuid(mainUuid);
    const email = activeSub.client_email;

    console.log(`Adding bypass client for ${email} with UUID ${bypassUuid} to Inbound 1...`);
    const bypassPayload = {
      inboundIds: [1],
      client: {
        id: bypassUuid,
        flow: 'xtls-rprx-vision',
        email: email + '_bp',
        limitIp: activeSub.limit_ip || 1,
        totalGB: 15 * 1024 * 1024 * 1024,
        expiryTime: 0,
        enable: true,
        tgId: 0,
        subId: '',
        comment: 'Bypass emergency profile'
      }
    };

    // Clean up any existing client first to avoid collision
    try {
      const delUrl = `${xuiApi.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_bp')}`;
      await axios.post(delUrl, {}, { headers, timeout: 5000 }).catch(() => null);
    } catch (e) {}

    const addUrl = `${xuiApi.baseUrl}/panel/api/clients/add`;
    const addRes = await axios.post(addUrl, bypassPayload, { headers, timeout: 10000 });
    console.log('Client Add Response:', addRes.data);
  }

  console.log('✅ Configuration successfully updated to single-inbound multiplexing!');
}

run().catch(err => {
  console.error('Error:', err.message);
});
