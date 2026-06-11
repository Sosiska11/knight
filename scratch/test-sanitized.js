import { Client } from 'ssh2';
import axios from 'axios';
import { URL, URLSearchParams } from 'url';

const sshConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

function sanitizeVlessUrl(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    const uuid = url.username;
    const host = url.hostname;
    const port = url.port;
    const params = url.searchParams;
    const hash = url.hash;

    const cleanParams = new URLSearchParams();

    const allowedKeys = [
      'security',
      'sni',
      'pbk',
      'sid',
      'fp',
      'flow',
      'type',
      'path',
      'mode',
      'headerType',
      'serviceName',
      'host'
    ];

    for (const key of allowedKeys) {
      const value = params.get(key);
      if (value !== null && value !== '') {
        cleanParams.set(key, value);
      }
    }

    // Filter/clean ALPN
    const alpn = params.get('alpn');
    if (alpn) {
      const parts = alpn.split(',').map(s => s.trim().toLowerCase());
      const cleanAlpn = parts.filter(s => ['h2', 'http/1.1'].includes(s));
      if (cleanAlpn.length > 0) {
        cleanParams.set('alpn', cleanAlpn.join(','));
      }
    }

    return `vless://${uuid}@${host}:${port}?${cleanParams.toString()}${hash}`;
  } catch (err) {
    return vlessUrl;
  }
}

function vlessUrlToOutbound(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    const uuid = url.username;
    const address = url.hostname;
    const port = parseInt(url.port, 10);
    const params = url.searchParams;
    
    const security = params.get('security') || 'none';
    const flow = params.get('flow') || '';
    const sni = params.get('sni') || '';
    const pbk = params.get('pbk') || '';
    const sid = params.get('sid') || '';
    const fp = params.get('fp') || 'chrome';
    const type = params.get('type') || 'tcp';
    
    const outbound = {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": address,
            "port": port,
            "users": [
              {
                "id": uuid,
                "encryption": "none",
                "flow": flow || undefined
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": type,
        "security": security
      }
    };
    
    if (security === 'tls') {
      outbound.streamSettings.tlsSettings = {
        "serverName": sni || undefined,
        "fingerprint": fp || undefined
      };
    } else if (security === 'reality') {
      outbound.streamSettings.realitySettings = {
        "show": false,
        "fingerprint": fp || 'chrome',
        "serverName": sni || undefined,
        "publicKey": pbk || undefined,
        "shortId": sid || undefined,
        "spiderX": ""
      };
    }
    
    // Add transport details
    const path = params.get('path');
    const serviceName = params.get('serviceName');
    const mode = params.get('mode');
    
    if (type === 'ws') {
      outbound.streamSettings.wsSettings = {
        "path": path || undefined
      };
    } else if (type === 'grpc') {
      outbound.streamSettings.grpcSettings = {
        "serviceName": serviceName || undefined,
        "multiMode": mode === 'multi'
      };
    }
    
    // Add custom ALPN if present
    const alpn = params.get('alpn');
    if (alpn) {
      const alpnList = alpn.split(',').map(s => s.trim());
      if (security === 'tls') {
        outbound.streamSettings.tlsSettings.alpn = alpnList;
      } else if (security === 'reality') {
        outbound.streamSettings.realitySettings.alpn = alpnList;
      }
    }
    
    return outbound;
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('Fetching configs...');
  const res = await axios.get('https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt');
  const lines = res.data.split('\n');

  // Let's find some nodes matching the IPs in cached list
  const targets = ['78.17.147.66', '64.188.71.108', '78.17.147.65', '84.32.96.100', '144.31.233.236', '185.245.40.220'];
  const testNodes = [];

  for (let line of lines) {
    line = line.trim();
    if (!line.startsWith('vless://')) continue;
    if (targets.some(ip => line.includes(ip))) {
      testNodes.push(line);
    }
  }

  console.log(`Found ${testNodes.length} nodes to test.`);

  const conn = new Client();
  
  function executeCommand(conn, cmd) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('close', (code, signal) => {
          resolve({ code, stdout, stderr });
        }).on('data', (data) => {
          stdout += data.toString();
        }).stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  conn.on('ready', async () => {
    console.log('✅ Connected to VPS...');
    try {
      for (const rawUrl of testNodes) {
        const cleanUrl = sanitizeVlessUrl(rawUrl);
        console.log(`\nTesting node: ${rawUrl.substring(0, 80)}...`);
        
        // Test 1: As-is
        const outboundAsIs = vlessUrlToOutbound(rawUrl);
        let worksAsIs = false;
        if (outboundAsIs) {
          const configJson = {
            "log": { "loglevel": "warning" },
            "inbounds": [{ "port": 10800, "listen": "127.0.0.1", "protocol": "socks" }],
            "outbounds": [outboundAsIs, { "protocol": "freedom" }]
          };
          await executeCommand(conn, `cat << 'EOF' > /tmp/test-xray-config.json\n${JSON.stringify(configJson)}\nEOF`);
          await executeCommand(conn, 'killall xray-linux-amd64 || true');
          await executeCommand(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -c /tmp/test-xray-config.json > /tmp/xray-test.log 2>&1 &');
          await new Promise(r => setTimeout(r, 1000));
          const curlRes = await executeCommand(conn, 'curl -s -x socks5h://127.0.0.1:10800 -I https://www.google.com --max-time 3');
          worksAsIs = curlRes.code === 0;
        }

        // Test 2: Sanitized
        const outboundClean = vlessUrlToOutbound(cleanUrl);
        let worksClean = false;
        if (outboundClean) {
          const configJson = {
            "log": { "loglevel": "warning" },
            "inbounds": [{ "port": 10800, "listen": "127.0.0.1", "protocol": "socks" }],
            "outbounds": [outboundClean, { "protocol": "freedom" }]
          };
          await executeCommand(conn, `cat << 'EOF' > /tmp/test-xray-config.json\n${JSON.stringify(configJson)}\nEOF`);
          await executeCommand(conn, 'killall xray-linux-amd64 || true');
          await executeCommand(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -c /tmp/test-xray-config.json > /tmp/xray-test.log 2>&1 &');
          await new Promise(r => setTimeout(r, 1000));
          const curlRes = await executeCommand(conn, 'curl -s -x socks5h://127.0.0.1:10800 -I https://www.google.com --max-time 3');
          worksClean = curlRes.code === 0;
        }

        console.log(` -> As-Is works: ${worksAsIs ? '🟢 YES' : '🔴 NO'} | Sanitized works: ${worksClean ? '🟢 YES' : '🔴 NO'}`);
      }

      await executeCommand(conn, 'killall xray-linux-amd64 || true');
      conn.end();
    } catch (e) {
      console.error(e);
      conn.end();
    }
  }).connect(sshConfig);
}

run().catch(console.error);
