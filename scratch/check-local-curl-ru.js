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
    console.log('\n--- Curl localhost on port 80 ---');
    await executeCommand(conn, 'curl -I http://127.0.0.1 || echo "curl failed"');
    
    console.log('\n--- Curl internal IP on port 80 ---');
    await executeCommand(conn, 'curl -I http://192.168.20.141 || echo "curl failed"');

    console.log('\n--- Curl public IP on port 80 ---');
    await executeCommand(conn, 'curl -I http://79.137.162.56 || echo "curl failed"');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
