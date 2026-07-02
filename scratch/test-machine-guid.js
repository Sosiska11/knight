import axios from 'axios';

async function testMachineGuid() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';

  const guid = 'bcd9c6bf-7812-4ea2-967f-4daf33dcc015';
  const hwids = [
    guid,
    guid.toUpperCase(),
    guid.replace(/-/g, ''),
    guid.replace(/-/g, '').toUpperCase()
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

testMachineGuid();
