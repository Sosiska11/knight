import { NodeSSH } from 'node-ssh';

const config = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ ...config, readyTimeout: 60000 });
  const scriptContent = `
import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('/root/knight-vpn-bot/database.db');
db.all('SELECT client_uuid, client_email, status FROM subscriptions LIMIT 5', (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows));
  db.close();
});
  `;
  await ssh.execCommand(`cat > /root/knight-vpn-bot/get_uuid.js << 'EOF'\n${scriptContent}\nEOF`);
  const result = await ssh.execCommand('node /root/knight-vpn-bot/get_uuid.js', { cwd: '/root/knight-vpn-bot' });
  if (result.stderr) console.error('VPS Stderr:', result.stderr);
  console.log('Subscriptions from VPS database:', result.stdout.trim());
  await ssh.execCommand('rm -f /root/knight-vpn-bot/get_uuid.js');
  ssh.dispose();
}

run().catch(console.error);
