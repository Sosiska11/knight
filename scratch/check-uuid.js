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
    console.log(`\nExecuting: ${cmd}`);
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
        process.stderr.write(data);
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS...');
  try {
    // 1. Query local database via Node to avoid escaping issues
    const dbQuery = `cd /root/knight-vpn-bot && node -e "
import('sqlite3').then(m => {
  const db = new m.default.Database('/root/knight-vpn-bot/database.db');
  db.all('SELECT client_email, client_uuid, bypass_connection_url FROM subscriptions WHERE status=\\'active\\'', (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log('=== Active DB Subscriptions ===');
      console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
  });
});
"`;
    await executeCommand(conn, dbQuery);

    // 2. Fetch clients of inbound 4 via local 3x-ui api check script
    await executeCommand(conn, 'node /root/knight-vpn-bot/scratch/diag-inbounds.js');

    // 3. Perform local curl tests to nginx port 80 (origin host) to verify loopback response
    await executeCommand(conn, 'curl -k -s -I http://127.0.0.1:80/knight-down');
    await executeCommand(conn, 'curl -k -s -I http://127.0.0.1:8080/knight-down');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
