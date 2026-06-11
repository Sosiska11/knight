import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await xuiApi.login();
  const headers = await xuiApi.getHeaders();
  
  const email = 'vpn_user_797540993_bp';
  const uuid = '985e730a-42aa-441f-88a0-d9223e6da8b1';
  
  // Clean up existing
  try {
    const delUrl = `${xuiApi.baseUrl}/panel/api/clients/del/${encodeURIComponent(email)}`;
    await axios.post(delUrl, {}, { headers, timeout: 5000 }).catch(() => null);
    
    // Also try older delete endpoints just in case
    const delFallbackUrl = `${xuiApi.baseUrl}/panel/api/inbounds/2/delClient/${uuid}`;
    await axios.post(delFallbackUrl, {}, { headers, timeout: 5000 }).catch(() => null);
  } catch (e) {}

  // Add to Inbound 1
  const payload = {
    inboundIds: [1],
    client: {
      id: uuid,
      flow: 'xtls-rprx-vision',
      email: email,
      limitIp: 2,
      totalGB: 15 * 1024 * 1024 * 1024,
      expiryTime: 0,
      enable: true,
      tgId: 0,
      subId: '',
      comment: 'Bypass emergency profile'
    }
  };

  const addUrl = `${xuiApi.baseUrl}/panel/api/clients/add`;
  const res = await axios.post(addUrl, payload, { headers, timeout: 10000 });
  console.log('Add client response:', res.data);
}

run();
