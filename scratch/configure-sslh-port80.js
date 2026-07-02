import { Client } from 'ssh2';

const config = {
  host: '79.137.162.56',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${cmd}`);
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
  console.log('✅ Connected to Russian VPS...');
  try {
    // 1. Stop and disable Apache2 to free up port 80
    console.log('\n--- Disabling Apache2 on port 80 ---');
    await executeCommand(conn, 'systemctl stop apache2 || true');
    await executeCommand(conn, 'systemctl disable apache2 || true');

    // 2. Configure sslh defaults to listen on both port 22 and port 80
    console.log('\n--- Writing new /etc/default/sslh configuration ---');
    const newConfig = `RUN=yes
DAEMON=sslh
DAEMON_OPTS="--user sslh --listen 0.0.0.0:22 --listen 0.0.0.0:80 --ssh 127.0.0.1:2222 --tls 141.11.197.6:8443"
`;
    const writeCmd = `cat << 'EOF' > /etc/default/sslh\n${newConfig}\nEOF`;
    await executeCommand(conn, writeCmd);

    // 3. Restart sslh service
    console.log('\n--- Restarting sslh service ---');
    await executeCommand(conn, 'systemctl restart sslh');

    // 4. Verify status and listening ports
    console.log('\n--- Checking sslh status ---');
    await executeCommand(conn, 'systemctl status sslh');

    console.log('\n--- Checking listening ports ---');
    await executeCommand(conn, 'ss -tlpn | grep sslh');

    conn.end();
  } catch (err) {
    console.error('Error during configuration:', err);
    conn.end();
  }
}).connect(config);
