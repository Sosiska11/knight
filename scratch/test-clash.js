import axios from 'axios';
import fs from 'fs';

async function fetchClash() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Clash'
      }
    });
    console.log('Successfully fetched Clash config.');
    fs.writeFileSync('scratch/clash-sub.yaml', response.data);
    console.log('Saved to scratch/clash-sub.yaml');
    
    // Let's print some lines of proxies
    const lines = response.data.split('\n');
    console.log('Total lines:', lines.length);
    const proxyLines = lines.filter(l => l.includes('name:') || l.includes('server:') || l.includes('uuid:'));
    console.log('Sample proxy info (first 20 lines):');
    console.log(proxyLines.slice(0, 20).join('\n'));
  } catch (error) {
    console.error('Error fetching Clash config:', error.message);
  }
}

fetchClash();
