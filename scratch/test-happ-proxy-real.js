import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

async function testProxy() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const proxyUrl = 'socks5://127.0.0.1:10808';
  console.log(`Attempting to fetch ${url} through proxy ${proxyUrl}...`);
  
  const agent = new SocksProxyAgent(proxyUrl);
  
  try {
    const response = await axios.get(url, {
      httpAgent: agent,
      httpsAgent: agent,
      headers: {
        // We send standard headers but let them go through the proxy
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    const decodedBody = Buffer.from(response.data, 'base64').toString('utf-8');
    console.log('Decoded Response Body (first 1000 chars):');
    console.log(decodedBody.substring(0, 1000));
  } catch (error) {
    console.error('Error fetching via proxy:', error.message);
  }
}

testProxy();
