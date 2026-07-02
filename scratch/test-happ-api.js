import axios from 'axios';

async function run() {
  try {
    const response = await axios.post('https://crypto.happ.su/api-v2.php', {
      url: 'https://knight1.space:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f'
    }, { timeout: 5000 });
    console.log('API Response status:', response.status);
    console.log('API Response body:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('API request failed:', err.message);
  }
}

run();
