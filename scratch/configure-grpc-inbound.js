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
  console.log('Fetching inbound 2...');
  const inbound2 = await xuiApi.getInbound(2);
  if (!inbound2) {
    console.error('❌ Inbound 2 not found.');
    return;
  }

  const settingsObj = typeof inbound2.settings === 'string'
    ? JSON.parse(inbound2.settings)
    : inbound2.settings;

  const streamSettings = typeof inbound2.streamSettings === 'string'
    ? JSON.parse(inbound2.streamSettings)
    : inbound2.streamSettings;

  // 1. Change network protocol to gRPC
  streamSettings.network = "grpc";
  
  // 2. Set gRPC settings
  streamSettings.grpcSettings = {
    "serviceName": "grpc"
  };

  // 3. Keep target as yandex.ru:443 and ensure serverNames are standard
  if (streamSettings.realitySettings) {
    streamSettings.realitySettings.target = "yandex.ru:443";
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
  }

  const payload = {
    remark: inbound2.remark,
    port: inbound2.port,
    protocol: inbound2.protocol,
    listen: inbound2.listen,
    enable: inbound2.enable,
    settings: JSON.stringify(settingsObj),
    streamSettings: JSON.stringify(streamSettings),
    sniffing: typeof inbound2.sniffing === 'object' ? JSON.stringify(inbound2.sniffing) : inbound2.sniffing
  };

  console.log('Updating inbound 2 settings to gRPC Reality...');
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/2`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });
  console.log('Inbound 2 Update Response:', res.data);
  console.log('✅ Configuration successfully updated!');
}

run().catch(err => {
  console.error('Error:', err.message);
});
