import axios from 'axios';

async function check() {
  const ip = '141.11.197.6';
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}`);
    console.log('ip-api.com:', res.data);
  } catch (err) {
    console.error('ip-api.com error:', err.message);
  }

  try {
    const res = await axios.get(`https://freeipapi.com/api/json/${ip}`);
    console.log('freeipapi.com:', res.data);
  } catch (err) {
    console.error('freeipapi.com error:', err.message);
  }

  try {
    const res = await axios.get(`https://ipinfo.io/${ip}/json`);
    console.log('ipinfo.io:', res.data);
  } catch (err) {
    console.error('ipinfo.io error:', err.message);
  }
}

check();


