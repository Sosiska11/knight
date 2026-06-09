import xuiApi from '../src/xui-api.js';
import config from '../src/config.js';

async function run() {
  await xuiApi.login();
  if (xuiApi.mockMode) return;

  console.log('Fetching inbound 1...');
  const inbound1 = await xuiApi.getInbound(1);
  console.log('Inbound 1 Settings:', JSON.stringify(inbound1, null, 2));

  console.log('Fetching inbound 2...');
  const inbound2 = await xuiApi.getInbound(2);
  console.log('Inbound 2 Settings:', JSON.stringify(inbound2, null, 2));
}

run();
