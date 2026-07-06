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
    
    const nodeCmd = `cd /root/knight-vpn-bot && node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/root/database.db');
db.all('SELECT client_email, client_uuid, status, expires_at FROM subscriptions', (err, rows) => {
  if (err) console.error(err);
  else console.log(JSON.stringify(rows, null, 2));
  db.close();
});
"`;
    await executeCommand(conn, nodeCmd).catch(err => console.log('check failed:', err.message));
    
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
