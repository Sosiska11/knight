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
    const cmd = `cd /root/knight-vpn-bot && node -e "
import('./src/database.js').then(async m => {
  const row = await m.getSubscriptionByUuid('0803d6f0-d419-4368-a8b2-b9bdb287784f');
  console.log('bypass_connection_url:', row.bypass_connection_url);
  const uuidMatch = row.bypass_connection_url ? row.bypass_connection_url.match(/vless:\\/\\/([^@]+)@/) : null;
  console.log('uuidMatch:', uuidMatch);
  const uuid = uuidMatch ? uuidMatch[1] : row.client_uuid;
  console.log('result uuid:', uuid);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
"`;
    await executeCommand(conn, cmd);
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
