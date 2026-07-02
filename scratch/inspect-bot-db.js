import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts',
  localAddress: '192.168.0.151'
};

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
    console.log('\n--- Inspecting Active Subscriptions in Bot Database ---');
    const cmd = `cd /root/knight-vpn-bot && node -e "
import('sqlite3').then(m => {
  const db = new m.default.Database('/root/knight-vpn-bot/database.db');
  db.all('SELECT tg_id, client_email, client_uuid, plan_name, starts_at, expires_at, status, bypass_connection_url FROM subscriptions WHERE status = \\'active\\'', (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
"`;
    await executeCommand(conn, cmd);
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
