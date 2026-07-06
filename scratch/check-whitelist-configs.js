import axios from 'axios';
import net from 'net';

function pingTcp(host, port, timeout = 2500) {
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

async function run() {
  const urls = [
    'https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/26.txt',
    'https://raw.githubusercontent.com/AvenCores/goida-vpn-configs/main/githubmirror/26.txt'
  ];

  let text = '';
  for (const url of urls) {
    try {
      console.log(`Trying to fetch from ${url}...`);
      const response = await axios.get(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000 
      });
      text = response.data;
      if (text && typeof text === 'string') {
        console.log(`Successfully fetched ${text.length} bytes.`);
        break;
      }
    } catch (e) {
      console.warn(`Failed to fetch from ${url}: ${e.message}`);
    }
  }

  if (!text) {
    console.error("Could not fetch the subscription list.");
    return;
  }

  // Check if it's base64 encoded
  let decodedText = text;
  if (!text.includes('://')) {
    try {
      decodedText = Buffer.from(text.trim(), 'base64').toString('utf8');
      console.log("Decoded Base64 subscription.");
    } catch (e) {
      console.warn("Failed to decode base64, using raw text.");
    }
  }

  const lines = decodedText.split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`Total config lines found: ${lines.length}`);

  const protocols = {};
  const candidates = [];

  for (let line of lines) {
    let protocol = 'unknown';
    const protoMatch = line.match(/^([a-zA-Z0-9]+):\/\//);
    if (protoMatch) {
      protocol = protoMatch[1];
    }
    protocols[protocol] = (protocols[protocol] || 0) + 1;

    let host = '';
    let port = 0;
    let remark = '';

    // Extract remark
    const parts = line.split('#');
    if (parts.length >= 2) {
      try {
        remark = decodeURIComponent(parts[1]);
      } catch (e) {
        remark = parts[1];
      }
    }

    // Attempt to extract host/port based on protocol format
    const hostPortMatch = line.match(/@([^:/]+):(\d+)/);
    if (hostPortMatch) {
      host = hostPortMatch[1];
      port = parseInt(hostPortMatch[2], 10);
    } else {
      const directMatch = line.match(/:\/\/([^:/]+):(\d+)/);
      if (directMatch) {
        host = directMatch[1];
        port = parseInt(directMatch[2], 10);
      }
    }

    if (host && port) {
      candidates.push({ protocol, host, port, remark, url: line });
    }
  }

  console.log("Protocols summary:", protocols);
  console.log(`Valid candidates with host/port: ${candidates.length}`);

  console.log("\nPinging servers...");
  const working = [];
  for (const c of candidates) {
    const isOnline = await pingTcp(c.host, c.port);
    console.log(`[${c.protocol.toUpperCase()}] ${c.host}:${c.port} (${c.remark}) -> ${isOnline ? 'WORKING' : 'DOWN'}`);
    if (isOnline) {
      working.push(c);
    }
  }

  console.log(`\n=== WORKING SERVERS (${working.length}/${candidates.length}) ===`);
  working.forEach((w, i) => {
    console.log(`${i+1}. [${w.protocol.toUpperCase()}] ${w.host}:${w.port} (${w.remark})`);
    console.log(`   URL: ${w.url}\n`);
  });
}

run().catch(err => console.error(err));
