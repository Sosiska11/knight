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

// Robust validation of VLESS URL parameters
function isValidConfig(url) {
  try {
    const queryPart = url.split('?')[1]?.split('#')[0];
    if (!queryPart) return false;

    const params = new URLSearchParams(queryPart);
    
    // Check security type
    const security = params.get('security');
    if (security === 'reality') {
      const pbk = params.get('pbk');
      const sni = params.get('sni');
      const sid = params.get('sid');
      const fp = params.get('fp');
      
      if (!pbk || !sni || !sid) return false;
      if (fp === '') return false; // empty fingerprint
      
      // Block known bad/blocked SNIs in Russia
      const lowerSni = sni.toLowerCase();
      if (lowerSni === 'google.com' || lowerSni === 'www.google.com') return false;
    } else if (security === 'tls') {
      const sni = params.get('sni');
      if (!sni) return false;
    } else {
      return false; // must be tls or reality
    }

    // Check for any empty parameters that might cause parsing errors in clients
    for (const [key, value] of params.entries()) {
      if (value === '') {
        // Empty parameter detected
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

// Fisher-Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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
    if (!isValidConfig(line)) continue;

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

  console.log(`DE Valid Candidates: ${deCandidates.length}`);
  console.log(`NL Valid Candidates: ${nlCandidates.length}`);

  // Shuffle candidates
  shuffle(deCandidates);
  shuffle(nlCandidates);

  console.log('\nPinging shuffled and validated DE candidates...');
  let deFound = 0;
  for (const c of deCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      console.log(`Selected DE Node: ${host}:${port} (${c.remark}) -> ${c.url.substring(0, 120)}...`);
      deFound++;
      if (deFound >= 3) break;
    }
  }

  console.log('\nPinging shuffled and validated NL candidates...');
  let nlFound = 0;
  for (const c of nlCandidates) {
    const match = c.url.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const isOnline = await pingTcp(host, port);
    if (isOnline) {
      console.log(`Selected NL Node: ${host}:${port} (${c.remark}) -> ${c.url.substring(0, 120)}...`);
      nlFound++;
      if (nlFound >= 3) break;
    }
  }
}

run().catch(err => console.error(err));
