import axios from 'axios';

async function testRegistryHwid() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';

  const hwids = [
    'EWpQcNKUHdRhMrVfambG6g==',
    '116a5070d2941dd46132b55f6a66c6ea',
    '116a5070-d294-1dd4-6132-b55f6a66c6ea'
  ];

  for (const hwid of hwids) {
    console.log(`\nTesting HWID: "${hwid}"`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'x-hwid': hwid
        },
        timeout: 5000
      });
      const decodedBody = Buffer.from(response.data, 'base64').toString('utf-8');
      console.log('  Status:', response.status);
      console.log('  x-hwid-limit:', response.headers['x-hwid-limit']);
      console.log('  Body Snippet:', decodedBody.substring(0, 200));
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }
}

testRegistryHwid();
