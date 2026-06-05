import xuiApi from './src/xui-api.js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testEndpoints() {
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('Login failed');
    return;
  }
  
  const headers = await xuiApi.getHeaders();
  console.log('Headers:', headers);
  
  const testUrls = [
    '/panel/api/inbounds/list',
    '/panel/api/inbounds/get/1',
    '/xui/API/inbounds/list'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`\nTesting GET ${url}...`);
      const res = await axios.get(`${xuiApi.baseUrl}${url}`, { headers, timeout: 5000 });
      console.log(`Status: ${res.status}`);
      console.log('Response:', JSON.stringify(res.data).substring(0, 500));
    } catch (err) {
      console.error(`Error for ${url}: status=${err.response?.status}, msg=${err.message}`);
      if (err.response?.data) {
        console.error('Response data:', err.response.data);
      }
    }
  }
}

testEndpoints();
