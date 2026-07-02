import axios from 'axios';

async function testSingboxJson() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63/singbox';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'sing-box'
      }
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Raw JSON Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSingboxJson();
