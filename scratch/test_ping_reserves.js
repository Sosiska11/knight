import axios from 'axios';
import net from 'net';

function pingTcp(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      status = true;
      socket.end();
    });

    socket.on('data', () => {
      status = true;
      socket.destroy();
    });

    socket.on('error', () => {
      status = false;
      socket.destroy();
    });

    socket.on('timeout', () => {
      status = false;
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });
  });
}

async function testPing() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    const deCandidates = [];
    const nlCandidates = [];

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

      if (
        lowerRemark.includes('германия') || 
        lowerRemark.includes('germany') || 
        /\bde\b/i.test(remark) || 
        /\bde-\d+/i.test(remark) || 
        remark.includes('🇩🇪')
      ) {
        country = 'DE';
      }
      else if (
        lowerRemark.includes('нидерланды') || 
        lowerRemark.includes('netherlands') || 
        /\bnl\b/i.test(remark) || 
        /\bnl-\d+/i.test(remark) || 
        remark.includes('🇳🇱')
      ) {
        country = 'NL';
      }

      if (country === 'DE') deCandidates.push(line);
      if (country === 'NL') nlCandidates.push(line);
    }

    console.log(`Candidates DE: ${deCandidates.length}, NL: ${nlCandidates.length}`);

    // Ping candidates to find up to 3 working ones
    const deWorking = [];
    const nlWorking = [];

    console.log("Pinging DE candidates...");
    for (const line of deCandidates) {
      const match = line.match(/@([^:/]+):(\d+)/);
      if (!match) continue;
      const host = match[1];
      const port = parseInt(match[2], 10);
      
      const isOnline = await pingTcp(host, port);
      if (isOnline) {
        console.log(` -> DE working: ${host}:${port}`);
        deWorking.push(line);
        if (deWorking.length >= 3) break;
      }
    }

    console.log("Pinging NL candidates...");
    for (const line of nlCandidates) {
      const match = line.match(/@([^:/]+):(\d+)/);
      if (!match) continue;
      const host = match[1];
      const port = parseInt(match[2], 10);
      
      const isOnline = await pingTcp(host, port);
      if (isOnline) {
        console.log(` -> NL working: ${host}:${port}`);
        nlWorking.push(line);
        if (nlWorking.length >= 3) break;
      }
    }

    console.log(`DE Working: ${deWorking.length}, NL Working: ${nlWorking.length}`);

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

testPing();
