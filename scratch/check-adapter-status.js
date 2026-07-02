import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts' });
  
  // Check adapter logs
  const logs = await ssh.execCommand('journalctl -u bridge-adapter --no-pager -n 30');
  console.log('=== ADAPTER LOGS (last 30 lines) ===');
  console.log(logs.stdout || logs.stderr);
  
  // Check if adapter is running
  const ps = await ssh.execCommand('pgrep -f bridge-adapter');
  console.log('\nPID:', ps.stdout.trim() || 'NOT RUNNING');
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
