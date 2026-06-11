import xuiClient from '../src/xui-api.js';
import axios from 'axios';

async function testNodes() {
  console.log('Logging in...');
  const success = await xuiClient.login();
  if (!success) {
    console.error('Login failed');
    return;
  }

  const headers = await xuiClient.getHeaders();
  
  const endpoints = [
    '/panel/api/nodes',
    '/panel/api/nodes/list',
    '/xui/API/nodes',
    '/panel/api/nodes/all'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\nTesting endpoint: ${endpoint}`);
      const response = await axios.get(`${xuiClient.baseUrl}${endpoint}`, {
        headers,
        timeout: 5000,
        validateStatus: () => true
      });
      console.log(`Status: ${response.status}`);
      console.log('Response body:', JSON.stringify(response.data).substring(0, 1000));
    } catch (err) {
      console.error(`Error on ${endpoint}:`, err.message);
    }
  }
}

testNodes();
