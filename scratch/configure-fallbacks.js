import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

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

  // Configure fallbacks to redirect whitelisted SNIs to the bypass port (52794)
  settingsObj.fallbacks = [
    { "name": "gosuslugi.ru", "dest": "127.0.0.1:52794" },
    { "name": "sberbank.ru", "dest": "127.0.0.1:52794" },
    { "name": "yandex.ru", "dest": "127.0.0.1:52794" },
    { "name": "vk.com", "dest": "127.0.0.1:52794" }
  ];

  const streamSettings = typeof inbound1.streamSettings === 'string'
    ? JSON.parse(inbound1.streamSettings)
    : inbound1.streamSettings;

  if (streamSettings.realitySettings) {
    // Remove the bypass SNIs from main inbound's Reality serverNames list
    // so they trigger VLESS fallback instead of being intercepted by Inbound 1 Reality
    streamSettings.realitySettings.serverNames = [
      "google.com",
      "speedtest.net",
      "microsoft.com",
      "samsung.com",
      "apple.com"
    ];
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

  console.log('Updating inbound 1 settings with fallbacks...');
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/1`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });
  console.log('Inbound 1 Update Response:', res.data);
  console.log('✅ Configuration successfully updated!');
}

run().catch(err => {
  console.error('Error:', err.message);
});
