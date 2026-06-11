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
  try {
    const errorLog = await executeCommand(conn, 'tail -n 40 /root/.pm2/logs/knight-vpn-bot-error.log');
    console.log('--- ERROR LOGS ---');
    console.log(errorLog.stdout);
    console.log(errorLog.stderr);

    const outLog = await executeCommand(conn, 'tail -n 40 /root/.pm2/logs/knight-vpn-bot-out.log');
    console.log('--- OUTPUT LOGS ---');
    console.log(outLog.stdout);
    console.log(outLog.stderr);

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
