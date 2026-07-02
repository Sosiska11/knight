import axios from 'axios';

async function check() {
  try {
    const res = await axios.get('https://ipinfo.io/141.11.197.6/json', { timeout: 5000 });
    console.log('IP Info for 141.11.197.6:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error fetching IP info:', err.message);
  }
}

check();
