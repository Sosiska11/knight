import xuiApi from '../src/xui-api.js';
import config from '../src/config.js';

async function run() {
  await xuiApi.login();
  if (xuiApi.mockMode) {
    console.log('API is running in mock mode, cannot query real panel.');
    return;
  }

  const inboundId = config.XUI_INBOUND_ID;
  console.log(`Fetching inbound ${inboundId}...`);
  const inbound = await xuiApi.getInbound(inboundId);
  if (!inbound) {
    console.log('Failed to fetch inbound.');
    return;
  }

  // Parse settings
  const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
  const clients = settings.clients || [];
  console.log(`Found ${clients.length} clients in inbound ${inboundId}.`);

  const clientByEmail = clients.find(c => c.email === 'vpn_user_797540993');
  console.log('Client found by email:', clientByEmail ? JSON.stringify(clientByEmail, null, 2) : 'NOT FOUND');

  const clientByUuid = clients.find(c => c.id === 'test-uuid-12345-expiry-warning');
  console.log('Client found by UUID:', clientByUuid ? JSON.stringify(clientByUuid, null, 2) : 'NOT FOUND');
}

run();
