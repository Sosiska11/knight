import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts' });
  
  console.log('=== Finding file named adapter on VPS ===');
  const files = await ssh.execCommand('find / -type f -name "adapter" 2>/dev/null');
  console.log(files.stdout || files.stderr);
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
