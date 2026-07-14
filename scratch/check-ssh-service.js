import { Client } from 'ssh2';

const config = {
  host: '127.0.0.1',
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
    await executeCommand(conn, 'systemctl is-active ssh.socket || echo "ssh.socket not active"');
    await executeCommand(conn, 'systemctl is-active ssh || echo "ssh service not active"');
    await executeCommand(conn, 'systemctl status ssh.socket || echo "no ssh.socket"');
    await executeCommand(conn, 'cat /etc/ssh/sshd_config.d/* || echo "no drop-in files"');
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
