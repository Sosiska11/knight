import { Client } from 'ssh2';
import net from 'net';

const config = {
  host: '127.0.0.1',
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
    // Kill any existing tcpdump
    await executeCommand(conn, 'killall tcpdump || true');

    // Start tcpdump on port 23 in background
    console.log('Starting tcpdump on port 23...');
    conn.exec('tcpdump -i any -nn port 23 -c 10 > /tmp/tcpdump-port23.log 2>&1', (err) => {
      if (err) console.error('tcpdump start error:', err);
    });

    // Wait a second for tcpdump to initialize
    await new Promise(r => setTimeout(r, 1000));

    // Try connecting to external port 16606
    console.log('Connecting to external port 16606...');
    await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.connect(16606, '127.0.0.1', () => {
        console.log('Connected to 16606 successfully!');
        socket.destroy();
        resolve();
      });
      socket.on('error', (err) => {
        console.log('Connection to 16606 error:', err.message);
        resolve();
      });
      socket.on('timeout', () => {
        console.log('Connection to 16606 timeout!');
        socket.destroy();
        resolve();
      });
    });

    // Wait a second for tcpdump to flush logs
    await new Promise(r => setTimeout(r, 1000));

    // Stop tcpdump
    await executeCommand(conn, 'killall tcpdump || true');

    // Read log
    console.log('\n--- Captured Packets on Internal Port 23 ---');
    const log = await executeCommand(conn, 'cat /tmp/tcpdump-port23.log');
    console.log(log.stdout || log.stderr);

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
