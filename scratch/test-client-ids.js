import axios from 'axios';

async function testClientIds() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';

  const clientIds = [
    'ab3c03e4f5a059db',
    '774f09c48e72c1ae',
    'b6dba6a84e83e73a',
    '7a2f9666c6556d1e',
    '2ea09a409feac729'
  ];

  for (const id of clientIds) {
    console.log(`\nTesting HWID: "${id}"`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'x-hwid': id
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

testClientIds();
