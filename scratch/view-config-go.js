import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });
  
  console.log('=== Reading internal/config/config.go ===');
  const catConfig = await ssh.execCommand('cat /root/yac-ws-bridge/adapter/internal/config/config.go');
  console.log(catConfig.stdout);
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
