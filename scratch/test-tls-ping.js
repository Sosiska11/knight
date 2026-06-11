import tls from 'tls';
import axios from 'axios';

function pingTls(host, port, sni, timeout = 3000) {
  return new Promise((resolve) => {
    let completed = false;
    
    // Set a safety timeout
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

    socket.on('error', (err) => {
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

async function runTest() {
  const url = 'https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt';
  const response = await axios.get(url, { timeout: 10000 });
  const lines = response.data.split('\n');
  
  const deNodes = [];
  for (let line of lines) {
    line = line.trim();
    if (!line.startsWith('vless://')) continue;
    if (line.includes('германия') || line.includes('germany') || /🇩🇪/i.test(line)) {
      deNodes.push(line);
    }
  }

  console.log(`Found ${deNodes.length} DE nodes. Pinging first 20 nodes with TLS connect...`);
  
  for (let i = 0; i < Math.min(deNodes.length, 30); i++) {
    const line = deNodes[i];
    const match = line.match(/@([^:/]+):(\d+)/);
    if (!match) continue;
    
    const host = match[1];
    const port = parseInt(match[2], 10);
    
    // Extract SNI
    const sniMatch = line.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';
    
    const isTlsOnline = await pingTls(host, port, sni);
    console.log(`${i+1}. Host: ${host}:${port} | SNI: ${sni} | TLS Handshake: ${isTlsOnline ? '🟢 SUCCESS' : '🔴 FAILED'}`);
  }
}

runTest();
