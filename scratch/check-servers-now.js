import { Client } from 'ssh2';
import net from 'net';
import dns from 'dns';
import { promisify } from 'util';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import xuiApi from '../src/xui-api.js';

const resolve4 = promisify(dns.resolve4);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MAIN_VPS = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const RU_VPS = {
  host: '79.137.162.56',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

function pingTcp(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;
    socket.setTimeout(timeout);
    
    socket.connect(port, host, () => {
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

function runSshCommand(sshConfig, cmd) {
  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          return resolve({ success: false, error: err.message });
        }
        stream.on('close', (code) => {
          conn.end();
          resolve({ success: true, code, stdout, stderr });
        }).on('data', (data) => {
          stdout += data.toString();
        }).stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    }).connect(sshConfig);
  });
}

async function main() {
  console.log('🔍 Starting Comprehensive Server Diagnostics...');
  
  // 1. DNS check
  console.log('\n--- 1. DNS Resolutions ---');
  try {
    const ips = await resolve4('knight1.space');
    console.log(`✅ knight1.space -> ${ips.join(', ')}`);
  } catch (err) {
    console.log(`❌ Failed to resolve knight1.space: ${err.message}`);
  }
  
  // 2. Local TCP Port Pings
  console.log('\n--- 2. TCP Port Pings ---');
  const portsToPing = [
    { name: 'Main VPS (SSH)', host: MAIN_VPS.host, port: MAIN_VPS.port },
    { name: 'Main VPS (3x-ui Panel)', host: 'knight1.space', port: 2053 },
    { name: 'Main VPS (Sub Server)', host: 'knight1.space', port: 3000 },
    { name: 'Main VPS (VLESS Reality)', host: 'knight1.space', port: 8443 },
    { name: 'Russian VPS (SSH)', host: RU_VPS.host, port: RU_VPS.port },
    { name: 'Russian VPS (sslh Port 80)', host: RU_VPS.host, port: 80 },
    { name: 'Russian VPS (sslh Port 22)', host: RU_VPS.host, port: 22 },
    { name: 'Russian VPS (sslh Port 443)', host: RU_VPS.host, port: 443 }
  ];
  
  for (const p of portsToPing) {
    const open = await pingTcp(p.host, p.port);
    console.log(`${open ? '🟢' : '🔴'} ${p.name} (${p.host}:${p.port}): ${open ? 'OPEN' : 'CLOSED/TIMEOUT'}`);
  }

  // 3. Subscription Server HTTP Ping
  console.log('\n--- 3. Subscription Server HTTP Check ---');
  try {
    const res = await axios.get('https://knight1.space:3000/sub/test', { timeout: 5000, validateStatus: () => true });
    console.log(`🟢 Sub Server HTTPS Test (/sub/test) -> Status: ${res.status}`);
  } catch (err) {
    console.log(`🔴 Sub Server HTTPS Test failed: ${err.message}`);
  }
  
  // 4. 3x-ui Login and Inbounds Check
  console.log('\n--- 4. 3x-ui API Check ---');
  const logged = await xuiApi.login();
  if (logged) {
    console.log('🟢 Login successful.');
    const inbounds = await xuiApi.getInbound(1);
    if (inbounds) {
      console.log(`🟢 Inbound 1: ${inbounds.remark} (Port: ${inbounds.port}, Enabled: ${inbounds.enable})`);
    } else {
      console.log('🔴 Failed to fetch Inbound 1');
    }
    const bypassId = process.env.XUI_BYPASS_INBOUND_ID;
    if (bypassId) {
      const bpInbound = await xuiApi.getInbound(bypassId);
      if (bpInbound) {
        console.log(`🟢 Inbound ${bypassId} (Bypass): ${bpInbound.remark} (Port: ${bpInbound.port}, Enabled: ${bpInbound.enable})`);
      } else {
        console.log(`🔴 Failed to fetch Bypass Inbound ${bypassId}`);
      }
    }
  } else {
    console.log('🔴 3x-ui panel login failed or mock mode activated.');
  }

  // 5. Main VPS SSH Diagnostics
  console.log('\n--- 5. Main VPS SSH Commands ---');
  const mainSsh = await runSshCommand(MAIN_VPS, 'pm2 status && ps aux | grep xray && ss -tulnp | grep -E "3000|8443|2053"');
  if (mainSsh.success) {
    console.log('🟢 Connected via SSH.');
    console.log('--- PM2 Status and Processes ---');
    console.log(mainSsh.stdout || mainSsh.stderr);
  } else {
    console.log(`🔴 SSH Connection failed: ${mainSsh.error}`);
  }

  // 6. Russian VPS SSH Diagnostics
  console.log('\n--- 6. Russian VPS SSH Commands ---');
  const ruSsh = await runSshCommand(RU_VPS, 'systemctl status sslh --no-pager && cat /etc/default/sslh || cat /etc/sslh.cfg && echo "=== Listening Ports ===" && ss -tulnp && echo "=== iptables nat rules ===" && iptables -t nat -S');
  if (ruSsh.success) {
    console.log('🟢 Connected via SSH.');
    console.log('--- Services & Configuration ---');
    console.log(ruSsh.stdout || ruSsh.stderr);
  } else {
    console.log(`🔴 SSH Connection failed: ${ruSsh.error}`);
  }
}

main().catch(console.error);
