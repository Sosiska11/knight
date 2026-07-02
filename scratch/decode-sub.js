import { Client } from 'ssh2';

const sshConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

function execute(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', () => {
        resolve(stdout.trim());
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

async function run() {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      const base64Data = await execute(conn, 'curl -k -s https://localhost:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f');
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      console.log('--- DECODED SUBSCRIPTION LINKS ---');
      console.log(decoded);
      console.log('----------------------------------');
      conn.end();
    } catch (e) {
      console.error(e);
      conn.end();
    }
  }).connect(sshConfig);
}

run();
