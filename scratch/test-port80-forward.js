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
  console.log('✅ Connected to Netherlands VPS...');
  try {
    console.log('\n--- Checking port 80 on Russian VPS ---');
    await executeCommand(conn, 'nc -zv -w 5 127.0.0.1 80');
    
    console.log('\n--- Checking plain HTTP curl to Russian VPS on port 80 ---');
    await executeCommand(conn, 'curl -v --connect-timeout 5 http://127.0.0.1:80 || true');
    
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
