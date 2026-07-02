import axios from 'axios';
import fs from 'fs';

async function fetchCorrectJson() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';
  const hwid = 'bcd9c6bf-7812-4ea2-967f-4daf33dcc015';

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'x-hwid': hwid
      }
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Type of response data:', typeof response.data);
    
    let content = '';
    if (typeof response.data === 'object') {
      content = JSON.stringify(response.data, null, 2);
    } else {
      // If it's a string, it might be base64 encoded text
      try {
        content = Buffer.from(response.data, 'base64').toString('utf-8');
      } catch (e) {
        content = response.data;
      }
    }
    
    fs.writeFileSync('scratch/extracted-configs-real.txt', content);
    console.log('Saved to scratch/extracted-configs-real.txt');
    console.log('\n--- Content Preview (first 1000 chars) ---');
    console.log(content.substring(0, 1000));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

fetchCorrectJson();
