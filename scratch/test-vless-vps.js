import { Client } from 'ssh2';
import { URL } from 'url';

const sshConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

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

    if (type === 'grpc') {
      outbound.streamSettings.grpcSettings = {
        "serviceName": params.get('serviceName') || "grpc"
      };
    }
    
    return outbound;
  } catch (err) {
    console.error('Failed to convert VLESS URL to outbound:', err.message);
    return null;
  }
}

// Config to test
const testUrls = [
  'vless://985e730a-42aa-441f-88a0-d9223e6da8b1@79.137.162.56:16605?type=tcp&security=reality&pbk=9GVK-0TGvL88TQn-A6fltF-7Y7mgS89vPu4JXaPjrh0&fp=chrome&sni=max.ru&sid=16179c10&flow=xtls-rprx-vision#🇷🇺 LTE | Обходка (16605 - sslh)',
  'vless://985e730a-42aa-441f-88a0-d9223e6da8b1@79.137.162.56:16606?type=tcp&security=reality&pbk=9GVK-0TGvL88TQn-A6fltF-7Y7mgS89vPu4JXaPjrh0&fp=chrome&sni=max.ru&sid=16179c10&flow=xtls-rprx-vision#🇷🇺 LTE | Обходка (16606 - iptables)'
];

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
    for (let i = 0; i < testUrls.length; i++) {
      const vlessUrl = testUrls[i];
      console.log(`\nTesting URL ${i+1}: ${vlessUrl}`);
      const outbound = vlessUrlToOutbound(vlessUrl);
      if (!outbound) continue;

      const xrayConfig = {
        "log": {
          "loglevel": "debug"
        },
        "inbounds": [
          {
            "port": 10800,
            "listen": "127.0.0.1",
            "protocol": "socks",
            "settings": {
              "udp": true
            }
          }
        ],
        "outbounds": [
          outbound,
          {
            "protocol": "freedom",
            "tag": "direct"
          }
        ]
      };

      const configJsonStr = JSON.stringify(xrayConfig, null, 2);
      
      // Write config to remote file
      const escConfig = configJsonStr.replace(/'/g, "'\\''");
      await executeCommand(conn, `cat << 'EOF' > /tmp/test-xray-config.json\n${escConfig}\nEOF`);
      
      // Start xray in background
      await executeCommand(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -c /tmp/test-xray-config.json > /tmp/xray-test.log 2>&1 &');
      
      // Wait a moment for xray to start
      await new Promise(r => setTimeout(r, 1500));
      
      // Run curl test
      console.log('Running test curl...');
      const curlRes = await executeCommand(conn, 'curl -s -x socks5h://127.0.0.1:10800 -I http://example.com --max-time 4');
      
      console.log('Curl status code (Exit):', curlRes.code);
      if (curlRes.stdout) {
        console.log('Curl Response:\n', curlRes.stdout.substring(0, 300));
      }
      if (curlRes.stderr) {
        console.log('Curl Error/Stderr:\n', curlRes.stderr);
      }

      // Check xray logs
      const logsRes = await executeCommand(conn, 'cat /tmp/xray-test.log');
      if (logsRes.stdout) {
        console.log('Xray process logs:\n', logsRes.stdout);
      }

      // Kill xray
      await executeCommand(conn, 'killall xray-linux-amd64 || kill $(pgrep -f test-xray-config.json) || true');
      
      // Wait for process cleanup
      await new Promise(r => setTimeout(r, 500));
    }
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(sshConfig);
