import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing remote command: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS...');
  try {
    console.log('\n--- Checking Remote Database File Info ---');
    await executeCommand(conn, 'ls -la /root/knight-vpn-bot/database.db || echo "No remote database found."');
    
    const nodeCmd = `cat << 'EOF' > /root/knight-vpn-bot/test-reserves.js
import tls from 'tls';
import axios from 'axios';

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

async function run() {
  console.log('Fetching configs...');
  const response = await axios.get('https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt', { timeout: 10000 });
  const lines = response.data.split('\\n');

  const deCandidates = [];
  const nlCandidates = [];

  for (let line of lines) {
    line = line.trim();
    if (!line.startsWith('vless://')) continue;
    if (!isConfigSecure(line)) continue;
    if (!isValidConfig(line)) continue;

    const parts = line.split('#');
    if (parts.length < 2) continue;
    const remark = decodeURIComponent(parts[1]);
    const lowerRemark = remark.toLowerCase();

    const isDE = lowerRemark.includes('германия') || lowerRemark.includes('germany') || /\\bde\\b/i.test(remark) || remark.includes('🇩🇪');
    const isNL = lowerRemark.includes('нидерланды') || lowerRemark.includes('netherlands') || /\\bnl\\b/i.test(remark) || remark.includes('🇳🇱');

    if (isDE) deCandidates.push({ remark, url: line });
    if (isNL) nlCandidates.push({ remark, url: line });
  }

  console.log('DE Candidates: ' + deCandidates.length + ', NL Candidates: ' + nlCandidates.length);

  const deWorking = [];
  const nlWorking = [];

  console.log('\\nPinging DE candidates...');
  for (const c of deCandidates) {
    const match = c.url.match(/@([^:/]+):(\\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const sniMatch = c.url.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';

    const isOnline = await pingTls(host, port, sni, 2000);
    if (isOnline) {
      console.log('DE OK: ' + host + ':' + port + ' | SNI: ' + sni + ' | Remark: ' + c.remark);
      deWorking.push({ url: c.url, sni, remark: c.remark });
      if (deWorking.length >= 15) break;
    }
  }

  console.log('\\nPinging NL candidates...');
  for (const c of nlCandidates) {
    const match = c.url.match(/@([^:/]+):(\\d+)/);
    if (!match) continue;
    const host = match[1];
    const port = parseInt(match[2], 10);
    const sniMatch = c.url.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';

    const isOnline = await pingTls(host, port, sni, 2000);
    if (isOnline) {
      console.log('NL OK: ' + host + ':' + port + ' | SNI: ' + sni + ' | Remark: ' + c.remark);
      nlWorking.push({ url: c.url, sni, remark: c.remark });
      if (nlWorking.length >= 15) break;
    }
  }
}

run().catch(console.error);
EOF
cd /root/knight-vpn-bot && node test-reserves.js`;
    await executeCommand(conn, nodeCmd).catch(err => console.log('check failed:', err.message));
    
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
