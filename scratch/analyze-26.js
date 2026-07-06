import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

async function run() {
  try {
    console.log('Downloading 26.txt...');
    const res = await axios.get('https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/26.txt');
    const lines = res.data.split('\n').map(l => l.trim()).filter(Boolean);
    console.log(`Total VLESS configs in 26.txt: ${lines.length}`);
    
    // Pick first 100
    const sample = lines.slice(0, 100);
    console.log('Analyzing first 100 configs...');
    
    let ruCount = 0;
    let otherCount = 0;
    let failedCount = 0;
    
    for (const line of sample) {
      const match = line.match(/@([^:/]+):(\d+)/);
      if (!match) continue;
      const host = match[1];
      
      let ip = host;
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
        try {
          const ips = await resolve4(host);
          ip = ips[0];
        } catch (e) {
          failedCount++;
          continue;
        }
      }
      
      // Let's use ipinfo.io to get country (or ip-api)
      try {
        const geo = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 3000 });
        const country = geo.data.country;
        const org = geo.data.org || '';
        if (country === 'RU') {
          ruCount++;
          console.log(`[RU] ${ip} | Org: ${org}`);
        } else {
          otherCount++;
        }
      } catch (e) {
        failedCount++;
      }
      // sleep 100ms
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\nResults: RU=${ruCount}, Other=${otherCount}, Failed/Timeout=${failedCount}`);
  } catch (e) {
    console.error(e);
  }
}

run();
