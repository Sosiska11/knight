import axios from 'axios';
import xuiApi from '../src/xui-api.js';

async function run() {
  console.log('🔑 Logging in to 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in.');
    return;
  }

  const headers = await xuiApi.getHeaders();
  
  // Define the comprehensive list of allowed SNIs
  const allowedServerNames = [
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

  // 1. Update Inbound 1 (Main, port 443)
  console.log('Fetching inbound 1...');
  const inbound1 = await xuiApi.getInbound(1);
  if (inbound1) {
    const streamSettings = typeof inbound1.streamSettings === 'string'
      ? JSON.parse(inbound1.streamSettings)
      : inbound1.streamSettings;

    if (streamSettings.realitySettings) {
      streamSettings.realitySettings.serverNames = allowedServerNames;
      
      const payload = {
        remark: inbound1.remark,
        port: inbound1.port,
        protocol: inbound1.protocol,
        listen: inbound1.listen,
        enable: inbound1.enable,
        settings: typeof inbound1.settings === 'object' ? JSON.stringify(inbound1.settings) : inbound1.settings,
        streamSettings: JSON.stringify(streamSettings),
        sniffing: typeof inbound1.sniffing === 'object' ? JSON.stringify(inbound1.sniffing) : inbound1.sniffing
      };

      console.log('Updating inbound 1 settings...');
      const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/1`;
      const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });
      console.log('Inbound 1 Update Response:', res.data);
    }
  }

  // 2. Update Inbound 2 (Bypass, port 52794)
  console.log('Fetching inbound 2...');
  const inbound2 = await xuiApi.getInbound(2);
  if (inbound2) {
    const streamSettings = typeof inbound2.streamSettings === 'string'
      ? JSON.parse(inbound2.streamSettings)
      : inbound2.streamSettings;

    if (streamSettings.realitySettings) {
      streamSettings.realitySettings.serverNames = allowedServerNames;
      
      const payload = {
        remark: inbound2.remark,
        port: inbound2.port,
        protocol: inbound2.protocol,
        listen: inbound2.listen,
        enable: inbound2.enable,
        settings: typeof inbound2.settings === 'object' ? JSON.stringify(inbound2.settings) : inbound2.settings,
        streamSettings: JSON.stringify(streamSettings),
        sniffing: typeof inbound2.sniffing === 'object' ? JSON.stringify(inbound2.sniffing) : inbound2.sniffing
      };

      console.log('Updating inbound 2 settings...');
      const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/2`;
      const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });
      console.log('Inbound 2 Update Response:', res.data);
    }
  }
}

run().catch(err => {
  console.error('Error:', err.message);
});
