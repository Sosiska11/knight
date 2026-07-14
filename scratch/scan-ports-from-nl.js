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

const candidatePorts = [];
// Scan 16600 to 16625, and some common ones
for (let p = 16600; p <= 16625; p++) {
  candidatePorts.push(p);
}
candidatePorts.push(80, 443, 8080, 8443);

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

    // Make sure iptables DNAT rules on RU VPS are temporarily cleared so they don't block the Python listeners!
    console.log('Temporarily clearing PREROUTING rules on Russian VPS to scan ports...');
    await executeRU('iptables -t nat -F PREROUTING || true');

    const workingPorts = [];
    for (const port of candidatePorts) {
      if (port === 16605) {
        workingPorts.push(port);
        continue;
      }

      console.log(`Testing port ${port}...`);
      
      // Start a temporary listener on the Russian VPS
      const listenCmd = `python3 -c 'import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", ${port})); s.listen(1); s.accept()'`;
      
      ruConn.exec(listenCmd, (err) => {
        if (err) console.error(`Failed to start listener on port ${port}:`, err.message);
      });

      // Wait a moment for listener to bind
      await new Promise(r => setTimeout(r, 600));

      // Test from NL VPS
      const checkRes = await executeNL(`nc -zv -w 2 127.0.0.1 ${port}`);
      const success = checkRes.code === 0 || checkRes.stderr.includes('succeeded') || checkRes.stdout.includes('succeeded');
      
      console.log(`Port ${port} reachability: ${success ? '✅ OPEN' : '❌ CLOSED'}`);
      if (success) {
        workingPorts.push(port);
      }

      // Kill listener
      await executeRU(`fuser -k -n tcp ${port} || true`);
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n======================================');
    console.log('Scan Results (tested from NL VPS):');
    console.log('Actually open ports:', workingPorts);
    console.log('======================================');

    // Restore the DNAT rule for port 16606 just in case (we will re-apply properly later)
    await executeRU('iptables -t nat -A PREROUTING -p tcp --dport 16606 -j DNAT --to-destination 141.11.197.6:8443');

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    ruConn.end();
    nlConn.end();
  }
}

runTest();
