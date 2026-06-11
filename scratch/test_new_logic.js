import axios from 'axios';

async function testNewLogic() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    const matches = [];

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
      let country = null;

      // Robust Germany check in remark only
      if (
        lowerRemark.includes('германия') || 
        lowerRemark.includes('germany') || 
        /\bde\b/i.test(remark) || 
        /\bde-\d+/i.test(remark) || 
        remark.includes('🇩🇪')
      ) {
        country = 'DE';
      }
      // Robust Netherlands check in remark only
      else if (
        lowerRemark.includes('нидерланды') || 
        lowerRemark.includes('netherlands') || 
        /\bnl\b/i.test(remark) || 
        /\bnl-\d+/i.test(remark) || 
        remark.includes('🇳🇱')
      ) {
        country = 'NL';
      }

      if (country) {
        matches.push({ country, remark, line: line.substring(0, 100) });
      }
    }

    const deNodes = matches.filter(n => n.country === 'DE');
    const nlNodes = matches.filter(n => n.country === 'NL');

    console.log(`Found ${deNodes.length} actual DE nodes and ${nlNodes.length} actual NL nodes.`);
    console.log("\nSample DE nodes:");
    deNodes.slice(0, 5).forEach((n, idx) => console.log(` ${idx+1}. Remark: [${n.remark}] -> ${n.line}...`));

    console.log("\nSample NL nodes:");
    nlNodes.slice(0, 5).forEach((n, idx) => console.log(` ${idx+1}. Remark: [${n.remark}] -> ${n.line}...`));

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

testNewLogic();
