import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts' });
  
  const result = await ssh.execCommand('cat /root/yac-ws-bridge/adapter/adapter.config.yaml');
  console.log('=== ADAPTER CONFIG ===');
  console.log(result.stdout || result.stderr);
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
