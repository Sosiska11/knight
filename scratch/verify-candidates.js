import { Client } from 'ssh2';
import axios from 'axios';
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
    
    return outbound;
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('Fetching configs...');
  // Fetch files 1, 2, 3
  const urls = [
    'https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt',
    'https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/2.txt'
  ];

  const deCandidates = [];
  const nlCandidates = [];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { timeout: 10000 });
      const lines = res.data.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('vless://')) continue;
        if (!line.includes('security=reality') && !line.includes('security=tls')) continue;

        const parts = line.split('#');
        if (parts.length < 2) continue;
        const remark = decodeURIComponent(parts[1]);
        const lowerRemark = remark.toLowerCase();

        const isDE = lowerRemark.includes('германия') || lowerRemark.includes('germany') || /\bde\b/i.test(remark) || remark.includes('🇩🇪');
        const isNL = lowerRemark.includes('нидерланды') || lowerRemark.includes('netherlands') || /\bnl\b/i.test(remark) || remark.includes('🇳🇱');

        if (isDE) deCandidates.push({ remark, url: line });
        if (isNL) nlCandidates.push({ remark, url: line });
      }
    } catch (e) {
      console.log(`Failed to fetch ${url}`);
    }
  }

  // Deduplicate
  function uniq(nodes) {
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

  const uniqueDe = uniq(deCandidates);
  const uniqueNl = uniq(nlCandidates);

  console.log(`Unique DE: ${uniqueDe.length}, NL: ${uniqueNl.length}`);

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
      const candidatesToTest = [
        ...uniqueDe.slice(0, 10).map(c => ({ country: 'DE', ...c })),
        ...uniqueNl.slice(0, 10).map(c => ({ country: 'NL', ...c }))
      ];

      for (let i = 0; i < candidatesToTest.length; i++) {
        const item = candidatesToTest[i];
        const outbound = vlessUrlToOutbound(item.url);
        if (!outbound) continue;

        const host = outbound.settings.vnext[0].address;
        const port = outbound.settings.vnext[0].port;

        // Construct xray config
        const xrayConfig = {
          "log": { "loglevel": "warning" },
          "inbounds": [{
            "port": 10800,
            "listen": "127.0.0.1",
            "protocol": "socks",
            "settings": { "udp": true }
          }],
          "outbounds": [outbound, { "protocol": "freedom", "tag": "direct" }]
        };

        const configJsonStr = JSON.stringify(xrayConfig);
        const escConfig = configJsonStr.replace(/'/g, "'\\''");
        await executeCommand(conn, `cat << 'EOF' > /tmp/test-xray-config.json\n${escConfig}\nEOF`);
        
        // Kill previous xray
        await executeCommand(conn, 'killall xray-linux-amd64 || true');
        
        // Start xray in background
        await executeCommand(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -c /tmp/test-xray-config.json > /tmp/xray-test.log 2>&1 &');
        await new Promise(r => setTimeout(r, 1000));

        // Get geo info from ip-api
        const geoRes = await executeCommand(conn, `curl -s http://ip-api.com/json/${host}`);
        let isp = 'UNKNOWN';
        try {
          const geoData = JSON.parse(geoRes.stdout);
          isp = geoData.org || geoData.isp || 'UNKNOWN';
        } catch (e) {}

        // Curl test
        const curlRes = await executeCommand(conn, 'curl -s -x socks5h://127.0.0.1:10800 -I https://www.google.com --max-time 3');
        const works = curlRes.code === 0;

        console.log(`[${item.country}] Host: ${host}:${port} | Works: ${works ? '🟢 YES' : '🔴 NO'} | ISP: ${isp} | Remark: ${item.remark}`);
      }

      // Cleanup
      await executeCommand(conn, 'killall xray-linux-amd64 || true');
      conn.end();
    } catch (e) {
      console.error(e);
      conn.end();
    }
  }).connect(sshConfig);
}

run().catch(console.error);
