import xuiApi from '../src/xui-api.js';

async function run() {
  console.log('🔑 Authenticating with 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in.');
    return;
  }

  const headers = await xuiApi.getHeaders();
  
  console.log('Fetching inbounds list from panel...');
  const response = await fetch(`${xuiApi.baseUrl}/panel/api/inbounds/list`, {
    headers: headers
  });
  const data = await response.json();
  
  if (data && data.success) {
    const inbounds = data.obj || [];
    console.log(`Found ${inbounds.length} inbounds.`);
    for (const inbound of inbounds) {
      console.log(`\n=========================================`);
      console.log(`ID: ${inbound.id} | Remark: ${inbound.remark} | Port: ${inbound.port} | Protocol: ${inbound.protocol}`);
      console.log(`Listen: ${inbound.listen} | Enable: ${inbound.enable}`);
      const streamSettingsObj = typeof inbound.streamSettings === 'string'
        ? JSON.parse(inbound.streamSettings)
        : inbound.streamSettings;
      console.log(`StreamSettings:`, JSON.stringify(streamSettingsObj, null, 2));
      
      const settingsObj = typeof inbound.settings === 'string'
        ? JSON.parse(inbound.settings)
        : inbound.settings;
      console.log(`Clients count:`, settingsObj.clients?.length || 0);
      if (settingsObj.clients && settingsObj.clients.length > 0) {
        console.log(`First Client:`, JSON.stringify(settingsObj.clients[0], null, 2));
      }
    }
  } else {
    console.error('❌ Failed to fetch inbounds:', data);
  }
}

run().catch(err => console.error(err));
