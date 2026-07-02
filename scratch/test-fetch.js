import axios from 'axios';

async function testFetch() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'sing-box',
    'Shadowrocket/2.2.36 (iPhone; iOS 17.5.1; Scale/3.00)',
    'Happ/1.0',
    'hiddify',
    'v2rayNG',
    'Clash'
  ];

  for (const ua of userAgents) {
    console.log(`\n--- Testing User-Agent: ${ua} ---`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua
        },
        timeout: 5000
      });
      console.log('Status:', response.status);
      console.log('Response Headers:', response.headers);
      console.log('Response Body Snippet (200 chars):', response.data.toString().substring(0, 200));
    } catch (error) {
      console.error('Error:', error.message);
      if (error.response) {
        console.log('Error Status:', error.response.status);
        console.log('Error Headers:', error.response.headers);
        console.log('Error Body:', error.response.data);
      }
    }
  }
}

testFetch();
