import axios from 'axios';

const ips = [
  '167.172.108.83',
  '78.17.147.65',
  '144.31.233.236',
  '144.31.135.162',
  '185.245.40.220',
  '20.103.221.187'
];

async function check() {
  for (const ip of ips) {
    try {
      const res = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 5000 });
      console.log(`IP: ${ip} | Org: ${res.data.org} | Country: ${res.data.country} | Region: ${res.data.region} | City: ${res.data.city}`);
    } catch (err) {
      console.log(`IP: ${ip} | Error: ${err.message}`);
    }
  }
}

check();
