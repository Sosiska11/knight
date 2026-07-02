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
    console.log('\n--- Adding TCPMSS clamping rule ---');
    await executeCommand(conn, 'iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu');
    await executeCommand(conn, 'iptables-save > /etc/iptables/rules.v4');

    console.log('\n--- Checking iptables filter policy ---');
    await executeCommand(conn, 'iptables -S');

    console.log('\n--- Checking iptables nat rules ---');
    await executeCommand(conn, 'iptables -t nat -S');

    console.log('\n--- Checking routing table ---');
    await executeCommand(conn, 'ip route');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
