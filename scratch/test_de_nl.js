import axios from 'axios';

async function scan() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    let deMatches = [];
    let nlMatches = [];

    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith('vless://')) continue;

      const parts = line.split('#');
      if (parts.length < 2) continue;

      const remarkEncoded = parts[1];
      let remark = '';
      try {
        remark = decodeURIComponent(remarkEncoded);
      } catch (e) {
        remark = remarkEncoded;
      }

      const lowerRemark = remark.toLowerCase();

      if (lowerRemark.includes('германия') || lowerRemark.includes('germany') || lowerRemark.includes('de') || lowerRemark.includes('🇩🇪')) {
        deMatches.push({ remark, line: line.substring(0, 80) });
      }
      if (lowerRemark.includes('нидерланды') || lowerRemark.includes('netherlands') || lowerRemark.includes('nl') || lowerRemark.includes('🇳🇱')) {
        nlMatches.push({ remark, line: line.substring(0, 80) });
      }
    }

    console.log(`Matched DE (sample of 15):`);
    deMatches.slice(0, 15).forEach((m, idx) => console.log(` ${idx+1}. [${m.remark}] -> ${m.line}...`));

    console.log(`\nMatched NL (sample of 15):`);
    nlMatches.slice(0, 15).forEach((m, idx) => console.log(` ${idx+1}. [${m.remark}] -> ${m.line}...`));

  } catch (err) {
    console.log(`Failed to fetch 1.txt: ${err.message}`);
  }
}

scan();
