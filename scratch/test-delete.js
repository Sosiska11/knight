import xuiApi from '../src/xui-api.js';
import axios from 'axios';

async function testDelete() {
  await xuiApi.login();
  const headers = await xuiApi.getHeaders();
  
  const email = 'vpn_user_5068609668';
  const url1 = `${xuiApi.baseUrl}/panel/api/clients/del/${encodeURIComponent(email)}`;
  
  try {
    const res1 = await axios.post(url1, {}, { headers, timeout: 5000, validateStatus: () => true });
    console.log('Endpoint /panel/api/clients/del/{email} response:');
    console.log('Status:', res1.status);
    console.log('Data:', JSON.stringify(res1.data));
  } catch (err) {
    console.log('Endpoint /panel/api/clients/del/{email} failed:', err.message);
  }
}

testDelete();
