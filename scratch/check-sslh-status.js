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
    await executeCommand(conn, 'systemctl status sslh || echo "sslh status check failed"');
    await executeCommand(conn, 'journalctl -n 30 -u sslh || echo "no logs"');
    await executeCommand(conn, 'cat /etc/sslh.cfg || echo "no /etc/sslh.cfg"');
    await executeCommand(conn, 'cat /lib/systemd/system/sslh.service || echo "no sslh.service file"');
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
