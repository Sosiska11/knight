import axios from 'axios';

async function run() {
  try {
    const res = await axios.get('https://api.github.com/repos/AvenCores/goida-vpn-configs/commits?path=githubmirror/1.txt', {
      headers: { 'User-Agent': 'node.js' },
      timeout: 10000
    });
    if (res.data && res.data.length > 0) {
      console.log("Last commit for 1.txt:");
      console.log(`Date: ${res.data[0].commit.committer.date}`);
      console.log(`Message: ${res.data[0].commit.message}`);
    } else {
      console.log("No commits found.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
