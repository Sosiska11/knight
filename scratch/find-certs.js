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
  console.log('✅ Connected to VPS to find certificates...');
  try {
    console.log('\n--- Searching for Cert files in common locations ---');
    await executeCommand(conn, 'find / -name "*.crt" -o -name "*.key" -o -name "*.pem" 2>/dev/null | grep -E "letsencrypt|acme|cert|x-ui" | head -n 40');

    console.log('\n--- Checking Certbot directories ---');
    await executeCommand(conn, 'ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "No Certbot live directory"');

    console.log('\n--- Checking acme.sh directories ---');
    await executeCommand(conn, 'ls -la /root/.acme.sh/ 2>/dev/null || echo "No acme.sh directory"');

    conn.end();
  } catch (err) {
    console.error('Error finding certs:', err);
    conn.end();
  }
}).connect(config);
