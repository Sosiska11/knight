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
  console.log('✅ Connected to Russian VPS for packet capture...');
  try {
    // 1. Kill any existing tcpdump
    await executeCommand(conn, 'killall tcpdump || true');

    // 2. Start tcpdump on port 80 in background
    console.log('Starting tcpdump on port 80...');
    conn.exec('tcpdump -i any -nn port 80 > /tmp/tcpdump-80.log 2>&1', (err, stream) => {
      if (err) console.error('tcpdump start error:', err);
    });

    // Wait a second for tcpdump to initialize
    await new Promise(r => setTimeout(r, 1000));

    // 3. Perform a TCP connection from local machine to Russian VPS port 80
    console.log('Connecting from local machine to Russian VPS port 80...');
    await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(80, '127.0.0.1', () => {
        console.log('✅ Connected successfully!');
        socket.write('GET / HTTP/1.1\r\n\r\n');
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 1000);
      });
      socket.on('error', (err) => {
        console.error('❌ Connection error:', err.message);
        resolve();
      });
      socket.on('timeout', () => {
        console.error('❌ Timeout connecting');
        socket.destroy();
        resolve();
      });
    });

    // 4. Kill tcpdump
    console.log('Stopping tcpdump...');
    await executeCommand(conn, 'killall tcpdump || true');

    // 5. Read and print log
    console.log('\n--- Packet Log ---');
    const log = await executeCommand(conn, 'cat /tmp/tcpdump-80.log');
    console.log(log.stdout || log.stderr);

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
