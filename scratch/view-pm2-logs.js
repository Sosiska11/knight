import { Client } from 'ssh2';

const config = {
  host: '144.31.196.245',
  port: 22,
  username: 'root',
  password: 'Kng-73_vPs!98aB',
  readyTimeout: 30000
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
    console.log('\n--- Output Logs ---');
    await executeCommand(conn, 'tail -n 1000 /root/.pm2/logs/knight-vpn-bot-out.log');


    console.log('\n--- Error Logs ---');
    await executeCommand(conn, 'tail -n 50 /root/.pm2/logs/knight-vpn-bot-error.log');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);

