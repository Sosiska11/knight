import axios from 'axios';

async function check() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    let totalDe = 0;
    let secureDe = [];

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
      
      if (
        lowerRemark.includes('германия') || 
        lowerRemark.includes('germany') || 
        /\bde\b/i.test(remark) || 
        /\bde-\d+/i.test(remark) || 
        remark.includes('🇩🇪')
      ) {
        totalDe++;
        
        // Check if secure
        const isReality = line.includes('security=reality');
        const isTls = line.includes('security=tls');
        if (isReality || isTls) {
          secureDe.push({ remark, line: line.substring(0, 120), isReality, isTls });
        }
      }
    }

    console.log(`Total Germany nodes: ${totalDe}`);
    console.log(`Secure Germany nodes (TLS/Reality): ${secureDe.length}`);
    console.log(`\nSample of secure DE nodes:`);
    secureDe.slice(0, 15).forEach((s, idx) => console.log(` ${idx+1}. [${s.remark}] (Reality=${s.isReality}, TLS=${s.isTls}) -> ${s.line}...`));

  } catch (err) {
    console.log("Error:", err.message);
  }
}

check();
