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
    await executeCommand(conn, 'grep -E "^[#]*Port" /etc/ssh/sshd_config || echo "no Port lines"');
    await executeCommand(conn, 'grep -E "^[#]*ListenAddress" /etc/ssh/sshd_config || echo "no ListenAddress lines"');
    await executeCommand(conn, 'ls -la /etc/ssh/sshd_config.d/ || echo "no sshd_config.d"');
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
