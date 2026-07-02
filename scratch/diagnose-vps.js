import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts',
  localAddress: '192.168.0.151'
};

function execute(conn, cmd) {
  return new Promise((resolve) => {
    console.log(`\n--- Executing: ${cmd} ---`);
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(`Error executing ${cmd}:`, err.message);
        return resolve();
      }
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
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

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected to VPS via physical interface!');
  try {
    await execute(conn, 'cat /usr/local/x-ui/bin/config.json');
    conn.end();
  } catch (err) {
    console.error('Error during diagnostics:', err);
    conn.end();
  }
}).on('error', (err) => {
  console.error('SSH Connection Error:', err.message);
}).connect(config);
