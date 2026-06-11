import axios from 'axios';

async function run() {
  try {
    const res = await axios.get('https://api.github.com/repos/AvenCores/goida-vpn-configs/git/trees/main?recursive=1', {
      headers: { 'User-Agent': 'node.js' },
      timeout: 10000
    });
    const files = res.data.tree.map(f => f.path).filter(p => p.endsWith('.txt'));
    console.log("Txt files in repo:");
    console.log(files);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
