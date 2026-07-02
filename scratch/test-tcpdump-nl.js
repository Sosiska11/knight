import { Client } from 'ssh2';
import tls from 'tls';

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
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to NL VPS for packet capture...');
  try {
    // 1. Kill any existing tcpdump
    await executeCommand(conn, 'killall tcpdump || true');

    // 2. Start tcpdump on port 8443 in background
    console.log('Starting tcpdump on port 8443 on NL VPS...');
    conn.exec('tcpdump -i any -nn port 8443 > /tmp/tcpdump-nl.log 2>&1', (err, stream) => {
      if (err) console.error('tcpdump start error:', err);
    });

    // Wait a second for tcpdump to initialize
    await new Promise(r => setTimeout(r, 1000));

    // 3. Connect to Russian VPS on port 16606 (should forward to NL VPS)
    console.log('Connecting to Russian VPS port 16606 (will forward to NL)...');
    
    await new Promise((resolve) => {
      const socket = tls.connect({
        host: '79.137.162.56',
        port: 16606,
        servername: 'max.ru',
        rejectUnauthorized: false,
        timeout: 4000
      }, () => {
        console.log('✅ Connected successfully!');
        socket.destroy();
        resolve();
      });
      socket.on('error', (err) => {
        console.error('❌ Connection error:', err.message);
        resolve();
      });
      socket.on('timeout', () => {
        console.error('❌ Connection timed out');
        socket.destroy();
        resolve();
      });
    });

    // 4. Kill tcpdump
    console.log('Stopping tcpdump...');
    await executeCommand(conn, 'killall tcpdump || true');

    // 5. Read and print log
    console.log('\n--- Packet Log on NL VPS ---');
    const log = await executeCommand(conn, 'cat /tmp/tcpdump-nl.log');
    console.log(log.stdout || log.stderr);

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
