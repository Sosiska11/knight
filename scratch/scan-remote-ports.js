import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to Netherlands VPS...');
  try {
    for (let port = 16600; port <= 16620; port++) {
      const res = await executeCommand(conn, `nc -zv -w 2 79.137.162.56 ${port}`);
      const success = res.code === 0 || res.stdout.includes('succeeded') || res.stderr.includes('succeeded');
      if (success) {
        console.log(`Port ${port}: OPEN`);
      } else {
        console.log(`Port ${port}: CLOSED`);
      }
    }
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
