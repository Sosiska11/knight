import axios from 'axios';
import fs from 'fs';

async function fetchWithCorrectHwid() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';
  const hwid = 'bcd9c6bf-7812-4ea2-967f-4daf33dcc015';

  console.log(`Fetching subscription with HWID: "${hwid}"...`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'x-hwid': hwid
      },
      timeout: 10000
    });
    
    console.log('Status:', response.status);
    console.log('Response Headers:', response.headers);
    
    // Decode base64 response
    const decodedBody = Buffer.from(response.data, 'base64').toString('utf-8');
    fs.writeFileSync('scratch/extracted-configs.txt', decodedBody);
    console.log('Saved decoded configs to scratch/extracted-configs.txt');
    
    console.log('\n--- Decoded Content Preview (first 1000 chars) ---');
    console.log(decodedBody.substring(0, 1000));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

fetchWithCorrectHwid();
