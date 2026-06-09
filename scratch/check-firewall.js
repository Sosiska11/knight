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
  console.log('✅ Connected to VPS to check firewall...');
  try {
    console.log('\n--- UFW Status ---');
    await executeCommand(conn, 'ufw status verbose');

    console.log('\n--- Iptables Rules ---');
    await executeCommand(conn, 'iptables -S');

    console.log('\n--- Firewalld Status ---');
    await executeCommand(conn, 'systemctl status firewalld || echo "firewalld not running"');

    conn.end();
  } catch (err) {
    console.error('Error checking firewall:', err);
    conn.end();
  }
}).connect(config);
