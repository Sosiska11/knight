import axios from 'axios';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

async function run() {
  try {
    const res = await axios.get('https://knight1.space:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f', {
      httpsAgent: agent,
      timeout: 10000
    });
    const decoded = Buffer.from(res.data, 'base64').toString('utf-8');
    console.log('--- DECODED SUBSCRIPTION LINKS ---');
    console.log(decoded);
    console.log('----------------------------------');
  } catch (e) {
    console.error('Error fetching subscription directly:', e.message);
  }
}

run();
