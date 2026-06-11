import axios from 'axios';

async function scan() {
  const files = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  for (const num of files) {
    const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/${num}.txt`;
    console.log(`Scanning ${num}.txt...`);
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const text = response.data;
      if (!text || typeof text !== 'string') continue;

      const lines = text.split('\n');
      let vlessCount = 0;
      let deCount = 0;
      let nlCount = 0;

      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('vless://')) continue;
        vlessCount++;

        const parts = line.split('#');
        if (parts.length < 2) continue;

        const remarkEncoded = parts[1];
        let remark = '';
        try {
          remark = decodeURIComponent(remarkEncoded).toLowerCase();
        } catch (e) {
          remark = remarkEncoded.toLowerCase();
        }

        if (remark.includes('германия') || remark.includes('germany') || remark.includes('de') || remark.includes('🇩🇪')) {
          deCount++;
        }
        if (remark.includes('нидерланды') || remark.includes('netherlands') || remark.includes('nl') || remark.includes('🇳🇱')) {
          nlCount++;
        }
      }

      console.log(`  File ${num}.txt: Total VLESS: ${vlessCount}, DE in remark: ${deCount}, NL in remark: ${nlCount}`);
    } catch (err) {
      console.log(`  Failed to fetch ${num}.txt: ${err.message}`);
    }
  }
}

scan();
