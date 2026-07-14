import { Client } from 'ssh2';

const russianConfig = {
  host: '127.0.0.1',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

const nlConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const candidatePorts = [
  80, 443, 8080, 8880, 8443, 9443, 16605, 2053, 2083, 2096, 3128, 5000, 9000, 10800, 20000, 30000, 4433, 8444
];

async function runTest() {
  const ruConn = new Client();
  const nlConn = new Client();

  const connectSSH = (conn, config) => new Promise((resolve, reject) => {
    conn.on('ready', () => resolve(conn)).on('error', reject).connect(config);
  });

  try {
    console.log('Connecting to both servers...');
    await Promise.all([
      connectSSH(ruConn, russianConfig),
      connectSSH(nlConn, nlConfig)
    ]);
    console.log('✅ Connected to both servers!');

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

    const executeNL = (cmd) => new Promise((resolve) => {
      nlConn.exec(cmd, (err, stream) => {
        if (err) return resolve({ code: 1, stderr: err.message });
        let stdout = '';
        let stderr = '';
        stream.on('close', (code) => resolve({ code, stdout, stderr }))
              .on('data', d => stdout += d.toString())
              .stderr.on('data', d => stderr += d.toString());
      });
    });

    // We'll test ports one by one
    const workingPorts = [];
    for (const port of candidatePorts) {
      if (port === 16605) {
        // We already know SSH port is open
        workingPorts.push(port);
        continue;
      }

      console.log(`\nTesting port ${port}...`);
      // Start a temporary listener on the Russian VPS using python3 or nc
      // We run it in background
      const listenCmd = `python3 -c 'import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", ${port})); s.listen(1); s.accept()'`;
      
      const ruStream = ruConn.exec(listenCmd, (err) => {
        if (err) console.error(`Failed to start listener on port ${port}:`, err.message);
      });

      // Wait a moment for listener to bind
      await new Promise(r => setTimeout(r, 800));

      // Test from NL
      const checkRes = await executeNL(`nc -zv -w 2 127.0.0.1 ${port}`);
      const success = checkRes.code === 0 || checkRes.stderr.includes('succeeded') || checkRes.stdout.includes('succeeded');
      
      console.log(`Port ${port} reachability result: ${success ? '✅ OPEN' : '❌ CLOSED'}`);
      if (success) {
        workingPorts.push(port);
      }

      // Kill any python listener on that port just in case
      await executeRU(`fuser -k -n tcp ${port} || true`);
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n======================================');
    console.log('Results of open port scanning:');
    console.log('Working (open) ports:', workingPorts);
    console.log('======================================');

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    ruConn.end();
    nlConn.end();
  }
}

runTest();
