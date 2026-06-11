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
  console.log('✅ Connected to VPS...');
  try {
    console.log('\n--- Checking running processes containing xray ---');
    await executeCommand(conn, 'ps aux | grep -i xray | grep -v grep');
    
    console.log('\n--- Checking 3x-ui binary path ---');
    await executeCommand(conn, 'find /usr/local/x-ui/ -type f || ls -la /usr/local/x-ui/');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
