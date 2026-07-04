import { NodeSSH } from 'node-ssh';

const sshConfig = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const ssh = new NodeSSH();

async function run() {
  await ssh.connect(sshConfig);
  const res = await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const db = new sqlite3.Database('./database.db');
db.all('SELECT client_email, client_uuid, status, expires_at FROM subscriptions', (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    rows.forEach(r => {
      const hash = crypto.createHash('sha256').update(r.client_uuid).digest('hex');
      const bypass = hash.substring(0, 8) + '-' + hash.substring(8, 12) + '-' + hash.substring(12, 16) + '-' + hash.substring(16, 20) + '-' + hash.substring(20, 32);
      console.log(r.client_email + ' (status=' + r.status + ') -> Main=' + r.client_uuid + ' -> Bypass=' + bypass);
    });
  }
  db.close();
});
  "`);
  console.log(res.stdout || res.stderr);
  ssh.dispose();
}

run();