import { NodeSSH } from 'node-ssh';

const config = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const cmd = process.argv.slice(2).join(' ') || 'hostname';
const ssh = new NodeSSH();

async function run() {
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Connecting attempt ${i+1}...`);
      await ssh.connect({ ...config, readyTimeout: 30000 });
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

  console.log(`Executing: ${cmd}`);
  const result = await ssh.execCommand(cmd);
  console.log(`Exit code: ${result.code}`);
  if (result.stdout) process.stdout.write(result.stdout + '\n');
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  ssh.dispose();
  process.exit(result.code);
}

run().catch(err => {
  console.error('Execution failed:', err.message);
  process.exit(1);
});
