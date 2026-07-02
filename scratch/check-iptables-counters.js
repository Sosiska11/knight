import { Client } from 'ssh2';
import net from 'net';

const config = {
  host: '79.137.162.56',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
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
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to Russian VPS...');
  try {
    console.log('\n--- NAT rules before attempt ---');
    const before = await executeCommand(conn, 'iptables -t nat -v -L PREROUTING && iptables -t nat -v -L POSTROUTING');
    console.log(before.stdout);

    console.log('Attempting local connection to port 16606...');
    await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.connect(16606, '79.137.162.56', () => {
        console.log('Connected!');
        socket.destroy();
        resolve();
      });
      socket.on('error', (err) => {
        console.log('Error:', err.message);
        resolve();
      });
      socket.on('timeout', () => {
        console.log('Timeout!');
        socket.destroy();
        resolve();
      });
    });

    console.log('\n--- NAT rules after attempt ---');
    const after = await executeCommand(conn, 'iptables -t nat -v -L PREROUTING && iptables -t nat -v -L POSTROUTING');
    console.log(after.stdout);

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
