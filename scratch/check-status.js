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
    console.log(`Executing remote command: ${cmd}`);
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
  console.log('✅ Connected to VPS to check status...');
  try {
    console.log('\n--- PM2 Status ---');
    await executeCommand(conn, 'pm2 status');

    console.log('\n--- Local Curl Test (from VPS itself) ---');
    await executeCommand(conn, 'curl -i http://localhost:3000/sub/test');

    console.log('\n--- Fetching and decoding real user subscription ---');
    await executeCommand(conn, 'curl -k -s https://localhost:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f | base64 -d');

    conn.end();
  } catch (err) {
    console.error('Error checking status:', err);
    conn.end();
  }
}).connect(config);
