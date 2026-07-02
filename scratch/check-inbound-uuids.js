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
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS...');
  try {
    const script = `cd /root/knight-vpn-bot && node -e "
import('./src/xui-api.js').then(async (m) => {
  const xuiApi = m.default;
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('login failed');
    process.exit(1);
  }
  const headers = await xuiApi.getHeaders();
  const res = await import('axios').then(a => a.default.get(xuiApi.baseUrl + '/panel/api/inbounds/get/4', { headers, timeout: 10000 }));
  const inbound = res.data.obj;
  const settings = JSON.parse(inbound.settings);
  const xuiClients = settings.clients || [];

  const mdb = await import('sqlite3');
  const db = new mdb.default.Database('/root/knight-vpn-bot/database.db');
  db.all('SELECT client_email, client_uuid FROM subscriptions WHERE status=\\'active\\'', (err, rows) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }

    console.log('=== Comparing DB Bypass UUIDs vs XUI Client UUIDs ===');
    
    // getBypassUuid helper
    const crypto = require('crypto');
    function getBypassUuid(mainUuid) {
      const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
      return hash.substring(0, 8) + '-' + hash.substring(8, 12) + '-' + hash.substring(12, 16) + '-' + hash.substring(16, 20) + '-' + hash.substring(20, 32);
    }

    rows.forEach(row => {
      const expectedBypassUuid = getBypassUuid(row.client_uuid);
      const emailCdn = row.client_email + '_cdn';
      
      const xuiClient = xuiClients.find(c => c.email === emailCdn);
      
      if (xuiClient) {
        const match = xuiClient.id === expectedBypassUuid;
        console.log(\`User: \${row.client_email}\`);
        console.log(\`  - DB Main UUID: \${row.client_uuid}\`);
        console.log(\`  - Expected Bypass UUID: \${expectedBypassUuid}\`);
        console.log(\`  - XUI Client UUID:      \${xuiClient.id}\`);
        console.log(\`  - Match: \${match ? '✅ YES' : '❌ NO'}\`);
      } else {
        console.log(\`User: \${row.client_email} -> ❌ NOT FOUND in XUI Inbound 4 under email \${emailCdn}\`);
      }
    });

    db.close();
  });
});
"`;
    await executeCommand(conn, script);
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
