import axios from 'axios';
import tls from 'tls';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

function pingTls(host, port, sni, timeout = 2500) {
  return new Promise((resolve) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(false);
        try { socket.destroy(); } catch (e) {}
      }
    }, timeout + 500);

    const socket = tls.connect({
      host: host,
      port: port,
      servername: sni || undefined,
      rejectUnauthorized: false,
      timeout: timeout
    }, () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(true);
        socket.destroy();
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(false);
        socket.destroy();
      }
    });

    socket.on('timeout', () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(false);
        socket.destroy();
      }
    });
  });
}

function isConfigSecure(url) {
  if (!url) return true;
  const insecurePattern = /[?&;](allowinsecure|allow_insecure|insecure)=(1|true|yes)/i;
  return !insecurePattern.test(url);
}

function isValidConfig(url) {
  try {
    const queryPart = url.split('?')[1]?.split('#')[0];
    if (!queryPart) return false;
    const params = new URLSearchParams(queryPart);
    const security = params.get('security');
    if (security === 'reality') {
      const pbk = params.get('pbk');
      const sni = params.get('sni');
      const sid = params.get('sid');
      if (!pbk || !sni || !sid) return false;
    } else if (security === 'tls') {
      const sni = params.get('sni');
      if (!sni) return false;
    } else {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function getGeoInfo(host) {
  try {
    let ip = host;
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      const ips = await resolve4(host);
      if (ips && ips.length > 0) {
        ip = ips[0];
      } else {
        return { ip: host, org: 'DNS lookup failed', country: 'UNKNOWN' };
      }
    }
    const res = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
    return {
      ip,
      org: res.data.org || res.data.isp || 'UNKNOWN',
      country: res.data.countryCode || 'UNKNOWN'
    };
  } catch (err) {
    return { ip: host, org: 'Lookup error: ' + err.message, country: 'UNKNOWN' };
  }
}

async function scan() {
  const fileNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const allDe = [];
  const allNl = [];

  console.log('Scanning all configs from repository...');
  
  for (const num of fileNumbers) {
    const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/${num}.txt`;
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const text = response.data;
      if (!text || typeof text !== 'string') continue;

      const lines = text.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('vless://')) continue;
        if (!isConfigSecure(line) || !isValidConfig(line)) continue;

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
        } else if (
          lowerRemark.includes('нидерланды') || 
          lowerRemark.includes('netherlands') || 
          /\bnl\b/i.test(remark) || 
          /\bnl-\d+/i.test(remark) || 
          remark.includes('🇳🇱')
        ) {
          country = 'NL';
        }

        if (country === 'DE') allDe.push({ url: line, remark });
        if (country === 'NL') allNl.push({ url: line, remark });
      }
    } catch (err) {
      console.log(`Failed to fetch ${num}.txt: ${err.message}`);
    }
  }

  // Deduplicate by host:port
  function uniqNodes(nodes) {
    const seen = new Set();
    return nodes.filter(n => {
      const match = n.url.match(/@([^:/]+):(\d+)/);
      if (!match) return false;
      const key = `${match[1]}:${match[2]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const uniqueDe = uniqNodes(allDe);
  const uniqueNl = uniqNodes(allNl);

  console.log(`\nUnique candidates found - DE: ${uniqueDe.length}, NL: ${uniqueNl.length}`);

  // Test first 30 DE and 30 NL candidates
  console.log('\n--- Checking DE Candidates (Top 30) ---');
  let deWorkingCount = 0;
  for (const c of uniqueDe.slice(0, 30)) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    const host = match[1];
    const port = parseInt(match[2], 10);
    const sniMatch = c.url.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';

    const isOnline = await pingTls(host, port, sni, 2000);
    if (isOnline) {
      const geo = await getGeoInfo(host);
      console.log(`DE WORKING: ${host}:${port} | SNI: ${sni} | ISP: ${geo.org} | GeoIP Country: ${geo.country} | Remark: ${c.remark}`);
      deWorkingCount++;
    }
  }

  console.log('\n--- Checking NL Candidates (Top 30) ---');
  let nlWorkingCount = 0;
  for (const c of uniqueNl.slice(0, 30)) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    const host = match[1];
    const port = parseInt(match[2], 10);
    const sniMatch = c.url.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';

    const isOnline = await pingTls(host, port, sni, 2000);
    if (isOnline) {
      const geo = await getGeoInfo(host);
      console.log(`NL WORKING: ${host}:${port} | SNI: ${sni} | ISP: ${geo.org} | GeoIP Country: ${geo.country} | Remark: ${c.remark}`);
      nlWorkingCount++;
    }
  }

  console.log(`\nScan complete. DE Working: ${deWorkingCount}/30 tested, NL Working: ${nlWorkingCount}/30 tested.`);
}

scan().catch(console.error);
