import axios from 'axios';

async function run() {
  const url = 'https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt';
  const response = await axios.get(url);
  const lines = response.data.split('\n');

  const targets = ['78.17.147.66', '64.188.71.108', '78.17.147.65', '84.32.96.100', '144.31.233.236', '185.245.40.220'];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (targets.some(ip => trimmed.includes(ip))) {
      console.log('--- FOUND CONFIG ---');
      console.log(trimmed);
    }
  }
}

run().catch(console.error);
