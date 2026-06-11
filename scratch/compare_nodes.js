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
    socket.on('data', () => { status = true; socket.destroy(); });
    socket.on('error', () => { status = false; socket.destroy(); });
    socket.on('timeout', () => { status = false; socket.destroy(); });
    socket.on('close', () => { resolve(status); });
  });
}

function isConfigSecure(url) {
  if (!url) return true;
  const insecurePattern = /[?&;](allowinsecure|allow_insecure|insecure)=(1|true|yes)/i;
  return !insecurePattern.test(url);
}

async function run() {
  const response = await axios.get('https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt', { timeout: 10000 });
  const text = response.data;
  const lines = text.split('\n');

  const deCandidates = [];
  const nlCandidates = [];

  for (let line of lines) {
    line = line.trim();
    if (!line.startsWith('vless://')) continue;

    if (!isConfigSecure(line)) continue;
    const isSecure = line.includes('security=tls') || line.includes('security=reality');
    if (!isSecure) continue;

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
      deCandidates.push({ remark, url: line });
    } else if (
      lowerRemark.includes('нидерланды') || 
      lowerRemark.includes('netherlands') || 
      /\bnl\b/i.test(remark) || 
      /\bnl-\d+/i.test(remark) || 
      remark.includes('🇳🇱')
    ) {
      nlCandidates.push({ remark, url: line });
    }
  }

  console.log(`DE secure candidates: ${deCandidates.length}`);
  console.log(`NL secure candidates: ${nlCandidates.length}`);

  const deWorking = [];
  for (const c of deCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      deWorking.push(c);
      if (deWorking.length >= 5) break;
    }
  }

  const nlWorking = [];
  for (const c of nlCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      nlWorking.push(c);
      if (nlWorking.length >= 5) break;
    }
  }

  console.log('\n--- WORKING GERMANY NODES ---');
  deWorking.forEach((w, i) => {
    console.log(`${i+1}. Remark: ${w.remark}`);
    console.log(`   URL: ${w.url}\n`);
  });

  console.log('--- WORKING NETHERLANDS NODES ---');
  nlWorking.forEach((w, i) => {
    console.log(`${i+1}. Remark: ${w.remark}`);
    console.log(`   URL: ${w.url}\n`);
  });
}

run().catch(err => console.error(err));
