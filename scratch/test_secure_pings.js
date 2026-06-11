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

async function testSecureDE() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    const deCandidates = [];

    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith('vless://')) continue;

      // Ensure it is secure VLESS (TLS or Reality)
      const isReality = line.includes('security=reality');
      const isTls = line.includes('security=tls');
      if (!isReality && !isTls) continue;

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
        deCandidates.push(line);
      }
    }

    console.log(`Found ${deCandidates.length} secure DE candidates.`);

    const working = [];
    for (const line of deCandidates) {
      const match = line.match(/@([^:/]+):(\d+)/);
      if (!match) continue;
      const host = match[1];
      const port = parseInt(match[2], 10);

      // Skip the first one if it was ru-2.videoproeditor.com since user said none of them worked
      if (host.includes('videoproeditor.com')) continue;

      const isOnline = await pingTcp(host, port, 2000);
      if (isOnline) {
        working.push(line);
        console.log(`Working secure DE: ${host}:${port} -> ${line.substring(0, 100)}...`);
        if (working.length >= 5) break;
      }
    }

  } catch (err) {
    console.log("Error:", err.message);
  }
}

testSecureDE();
