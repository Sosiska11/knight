import axios from 'axios';
import net from 'net';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

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

async function getCountry(host) {
  try {
    let ip = host;
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      const ips = await resolve4(host);
      if (ips && ips.length > 0) {
        ip = ips[0];
      }
    }
    const res = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
    return res.data.country_code || 'UNKNOWN';
  } catch (err) {
    return 'ERR: ' + err.message;
  }
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
    const isSecure = line.includes('security=reality') || line.includes('security=tls');
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

  console.log(`DE Candidates: ${deCandidates.length}`);
  console.log(`NL Candidates: ${nlCandidates.length}`);

  console.log('\nPinging and looking up GeoIP for top DE candidates...');
  let deFound = 0;
  for (const c of deCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      const country = await getCountry(host);
      console.log(`DE Node: ${host}:${port} (${c.remark}) -> GeoIP Country: ${country}`);
      deFound++;
      if (deFound >= 10) break;
    }
  }

  console.log('\nPinging and looking up GeoIP for top NL candidates...');
  let nlFound = 0;
  for (const c of nlCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      const country = await getCountry(host);
      console.log(`NL Node: ${host}:${port} (${c.remark}) -> GeoIP Country: ${country}`);
      nlFound++;
      if (nlFound >= 10) break;
    }
  }
}

run().catch(err => console.error(err));
