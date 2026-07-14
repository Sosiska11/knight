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

    // 1. Kill any tcpdump on RU VPS
    await executeRU('killall tcpdump || true');

    // 2. Start tcpdump on RU VPS
    console.log('Starting tcpdump on Russian VPS...');
    ruConn.exec('tcpdump -i any -nn port 16606 > /tmp/tcpdump-16606-nl.log 2>&1', (err) => {
      if (err) console.error('tcpdump start error:', err);
    });

    await new Promise(r => setTimeout(r, 1000));

    // 3. Connect from NL VPS to RU VPS port 16606
    console.log('Connecting from NL VPS to RU VPS port 16606...');
    const ncRes = await executeNL('nc -zv -w 5 127.0.0.1 16606');
    console.log('nc output:', ncRes.stdout || ncRes.stderr);

    // 4. Kill tcpdump
    console.log('Stopping tcpdump...');
    await executeRU('killall tcpdump || true');

    // 5. Read RU VPS tcpdump log
    console.log('\n--- Packet Log on Russian VPS ---');
    const log = await executeRU('cat /tmp/tcpdump-16606-nl.log');
    console.log(log.stdout || log.stderr);

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    ruConn.end();
    nlConn.end();
  }
}

runTest();
