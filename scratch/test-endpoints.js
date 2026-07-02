import axios from 'axios';

async function testEndpoints() {
  const baseUrl = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  
  const variations = [
    '',
    '/singbox',
    '/sing-box',
    '/clash',
    '/shadowrocket',
    '/hiddify',
    '?client=sing-box',
    '?client=clash',
    '?client=shadowrocket',
    '?client=hiddify',
    '?format=sing-box',
    '?format=clash',
    '?format=shadowrocket'
  ];

  for (const v of variations) {
    const url = baseUrl + (v.startsWith('?') ? v : v);
    console.log(`\n--- Testing URL: ${url} ---`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'sing-box' // Or other
        },
        timeout: 5000
      });
      console.log('  Status:', response.status);
      console.log('  Content-Type:', response.headers['content-type']);
      const body = response.data.toString();
      console.log('  Body Length:', body.length);
      console.log('  Body Snippet:', body.substring(0, 300));
      
      // Check if it contains real proxy configs
      if (body.includes('vless://') && !body.includes('App not supported') && !body.includes('PREVYSEN LIMIT')) {
        console.log('  🎉 FOUND REAL PROXIES!');
      }
    } catch (error) {
      console.log('  Error:', error.message);
    }
  }
}

testEndpoints();
