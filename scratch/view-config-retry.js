import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Connecting attempt ${i+1}...`);
      await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });
      connected = true;
      break;
    } catch (e) {
      console.log(`Connection failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('Failed to connect to VPS after 5 attempts');
    process.exit(1);
  }
  
  console.log('=== Reading internal/config/config.go ===');
  const catConfig = await ssh.execCommand('cat /root/yac-ws-bridge/adapter/internal/config/config.go');
  console.log(catConfig.stdout || catConfig.stderr);
  
  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
