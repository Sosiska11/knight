import axios from 'axios';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

const uuid = '0803d6f0-d419-4368-a8b2-b9bdb287784f';
const baseUrl = 'https://141.11.197.6:3000'; // or https://knight1.space:3000

async function testMode(mode) {
  const url = `${baseUrl}/sub/${uuid}?test=${mode}`;
  console.log(`\nFetching: ${url}`);
  try {
    const res = await axios.get(url, { httpsAgent: agent, timeout: 15000 });
    const decoded = Buffer.from(res.data.trim(), 'base64').toString('utf-8');
    const lines = decoded.split('\n').filter(l => l.trim());
    console.log(`Success! Decoded VLESS URLs count: ${lines.length}`);
    lines.forEach((line, idx) => {
      console.log(`  [Config ${idx + 1}] -> ${line}`);
    });
  } catch (err) {
    console.error(`Error fetching mode ${mode}:`, err.message);
  }
}

async function run() {
  await testMode('clean');
  await testMode('de');
  await testMode('ru');
}

run();
