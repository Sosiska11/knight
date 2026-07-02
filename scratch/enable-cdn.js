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
    const envPath = '/root/knight-vpn-bot/.env';
    console.log(`Configuring CDN settings in ${envPath}...`);
    
    // Set USE_CDN_BYPASS=true
    await executeCommand(conn, `sed -i 's/USE_CDN_BYPASS=false/USE_CDN_BYPASS=true/g' ${envPath}`);
    // Set CDN_DOMAIN=cdn.node-ping-stat.ru (handles empty or pre-existing values safely)
    await executeCommand(conn, `sed -i 's/CDN_DOMAIN=.*/CDN_DOMAIN=cdn.node-ping-stat.ru/g' ${envPath}`);
    
    console.log('Verifying configuration changes...');
    await executeCommand(conn, `grep -E "USE_CDN_BYPASS|CDN_DOMAIN" ${envPath}`);
    
    console.log('Restarting Knight VPN Bot...');
    await executeCommand(conn, "pm2 restart knight-vpn-bot");
    
    console.log('✅ CDN Bypass successfully enabled and bot restarted!');
    conn.end();
  } catch (err) {
    console.error('Error enabling CDN:', err);
    conn.end();
  }
}).connect(config);
