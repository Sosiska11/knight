import { Client } from 'ssh2';
import net from 'net';

const russianConfig = {
  host: '79.137.162.56',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

async function runTest() {
  const ruConn = new Client();

  const connectSSH = (conn, config) => new Promise((resolve, reject) => {
    conn.on('ready', () => resolve(conn)).on('error', reject).connect(config);
  });

  try {
    console.log('Connecting to Russian VPS...');
    await connectSSH(ruConn, russianConfig);
    console.log('✅ Connected!');

    const executeRU = (cmd) => new Promise((resolve) => {
      ruConn.exec(cmd, (err, stream) => {
        if (err) return resolve({ code: 1, stderr: err.message });
        let stdout = '';
        let stderr = '';
        stream.on('close', (code) => resolve({ code, stdout, stderr }))
              .on('data', d => stdout += d.toString())
              .stderr.on('data', d => stderr += d.toString());
      });
    });

    const startPort = 16600;
    const endPort = 16620;
    const workingPorts = [];

    for (let port = startPort; port <= endPort; port++) {
      if (port === 16605) {
        workingPorts.push(port);
        continue;
      }

      console.log(`Testing port ${port}...`);

      // Start a listener in background on Russian VPS
      const listenCmd = `python3 -c 'import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", ${port})); s.listen(1); s.accept()'`;
      ruConn.exec(listenCmd, (err) => {
        if (err) console.error(`Failed listener on ${port}:`, err.message);
      });

      await new Promise(r => setTimeout(r, 600));

      // Test connection locally
      const success = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);
        socket.connect(port, '79.137.162.56', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
      });

      console.log(`Port ${port}: ${success ? '✅ OPEN' : '❌ CLOSED'}`);
      if (success) {
        workingPorts.push(port);
      }

      // Cleanup
      await executeRU(`fuser -k -n tcp ${port} || true`);
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n======================================');
    console.log('NAT Port Scan Results:');
    console.log('Open mapped ports:', workingPorts);
    console.log('======================================');

  } catch (err) {
    console.error('Scan failed:', err);
  } finally {
    ruConn.end();
  }
}

runTest();
