import axios from 'axios';
import https from 'https';

async function testFetch() {
  const url = 'https://knight1.space:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f';
  try {
    const response = await axios.get(url, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }), // In case of self-signed certs
      timeout: 10000
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    const bodyDecoded = Buffer.from(response.data, 'base64').toString('utf-8');
    console.log('Body Decoded:\n', bodyDecoded);
  } catch (err) {
    console.error('Error fetching subscription:', err.message);
    if (err.response) {
      console.log('Response status:', err.response.status);
      console.log('Response body:', err.response.data);
    }
  }
}

testFetch();
