import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });
  
  const result = await ssh.execCommand('journalctl -u bridge-adapter --no-pager -n 15');
  console.log('=== LATEST ADAPTER LOGS ===');
  console.log(result.stdout || result.stderr);
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
