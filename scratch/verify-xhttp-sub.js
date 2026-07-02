import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: '141.11.197.6',
    username: 'root',
    password: 'IxJlIDug5LW5mF5ghOts',
    localAddress: '192.168.0.151',
    readyTimeout: 60000
  });

  console.log('✅ Connected to VPS');

  // Step 1: Get a UUID from the database using a heredoc script on VPS
  console.log('\n=== Step 1: Get active subscription UUID ===');
  const getUuidResult = await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');
db.all('SELECT client_uuid, bypass_connection_url FROM subscriptions WHERE status = ?', ['active'], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  for (const r of rows) {
    console.log('UUID: ' + r.client_uuid);
    console.log('BYPASS: ' + (r.bypass_connection_url || 'null'));
    console.log('---');
  }
  db.close();
});
"`);

  if (getUuidResult.stderr && !getUuidResult.stdout) {
    console.log('DB Error:', getUuidResult.stderr);
  } else {
    console.log(getUuidResult.stdout);
  }

  // Extract first UUID from output
  const uuidMatch = (getUuidResult.stdout || '').match(/UUID: ([a-f0-9-]+)/);
  if (!uuidMatch) {
    console.log('❌ No active subscriptions found in remote DB');
    ssh.dispose();
    return;
  }

  const testUuid = uuidMatch[1];
  console.log(`\n=== Step 2: Fetch subscription for ${testUuid} ===`);
  
  const subResult = await ssh.execCommand(`curl -sk https://127.0.0.1:3000/sub/${testUuid} | base64 -d 2>/dev/null`);
  const subOutput = subResult.stdout || '';
  console.log(subOutput);

  // Step 3: Analyze the output
  console.log('\n=== Step 3: Analysis ===');
  const lines = subOutput.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    if (line.includes('xhttp') || line.includes('splithttp') || line.includes('Обходка') || line.includes('LTE')) {
      console.log('\n🔍 Bypass link found:');
      console.log(line);
      
      if (line.includes('type=xhttp')) {
        console.log('  ✅ type=xhttp — correct');
      } else if (line.includes('type=splithttp')) {
        console.log('  ❌ type=splithttp — WRONG! Should be xhttp');
      }
      
      if (line.includes('mode=packet-up')) {
        console.log('  ✅ mode=packet-up — correct');
      }
      
      if (line.includes('uploadMethod') || line.includes('downloadMethod') || line.includes('uplinkHTTPMethod')) {
        console.log('  ❌ Contains old SplitHTTP-era parameters — WRONG!');
      } else {
        console.log('  ✅ No old SplitHTTP-era parameters — clean');
      }
      
      if (line.includes('security=tls')) {
        console.log('  ✅ security=tls — correct');
      }

      if (line.includes('cdn.node-ping-stat.ru')) {
        console.log('  ✅ CDN domain — correct');
      }
    }
  }

  console.log(`\n📊 Total configs in subscription: ${lines.length}`);
  
  ssh.dispose();
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
