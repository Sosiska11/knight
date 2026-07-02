import axios from 'axios';
import fs from 'fs';

async function testBrowser() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    fs.writeFileSync('scratch/browser-response.html', response.data);
    console.log('Saved to scratch/browser-response.html');
    console.log('Body Preview (first 1000 chars):');
    console.log(response.data.toString().substring(0, 1000));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testBrowser();
