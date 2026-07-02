import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

async function testProxy() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  
  // Port 2412 is the SOCKS/HTTP mixed port of Happ
  const proxyUrl = 'socks5://127.0.0.1:2412';
  console.log(`Attempting to fetch ${url} through proxy ${proxyUrl}...`);
  
  const agent = new SocksProxyAgent(proxyUrl);
  
  try {
    const response = await axios.get(url, {
      httpAgent: agent,
      httpsAgent: agent,
      headers: {
        // Do NOT send User-Agent or other headers, let the proxy or standard axios request handle it
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
