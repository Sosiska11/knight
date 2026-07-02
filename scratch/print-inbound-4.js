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

conn.on('ready', async () => {
  console.log('✅ Connected to VPS...');
  try {
    const script = `cd /root/knight-vpn-bot && node -e "
import('./src/xui-api.js').then(async (m) => {
  const xuiApi = m.default;
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('login failed');
    process.exit(1);
  }
  const headers = await xuiApi.getHeaders();
  const res = await import('axios').then(a => a.default.get(xuiApi.baseUrl + '/panel/api/inbounds/get/4', { headers, timeout: 10000 }));
  console.log('=== RAW INBOUND 4 ===');
  console.log(JSON.stringify(res.data.obj, null, 2));
});
"`;
    await executeCommand(conn, script);
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
