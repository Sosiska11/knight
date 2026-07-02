import axios from 'axios';

async function testHeaders() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0'; // Or shadowrocket
  
  const headerVariations = [
    { 'x-hwid': 'test-hwid-12345' },
    { 'x-client-id': 'test-client-12345' },
    { 'x-client-hwid': 'test-client-hwid-12345' },
    { 'hwid': 'test-hwid-12345' },
    { 'client-id': 'test-client-12345' },
    { 'device-id': 'test-device-12345' },
    { 'x-device-id': 'test-device-12345' },
    { 'x-device-uuid': 'test-uuid-12345' },
    { 'x-hwid': '95opvjz6WUftVLcqamj6jA==' }, // Tag from Happ db
    { 'x-client-id': '95opvjz6WUftVLcqamj6jA==' }
  ];

  for (const headers of headerVariations) {
    const headerName = Object.keys(headers)[0];
    console.log(`\n--- Testing Header: ${headerName} = ${headers[headerName]} ---`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          ...headers
        },
        timeout: 5000
      });
      console.log('Status:', response.status);
      console.log('Response Headers:', {
        'x-hwid-active': response.headers['x-hwid-active'],
        'x-hwid-limit': response.headers['x-hwid-limit'],
        'x-hwid-not-supported': response.headers['x-hwid-not-supported'],
        'content-type': response.headers['content-type']
      });
      const decodedBody = Buffer.from(response.data, 'base64').toString('utf-8');
      console.log('Response Body Decoded (first 200 chars):', decodedBody.substring(0, 200));
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testHeaders();
