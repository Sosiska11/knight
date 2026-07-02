import { NodeSSH } from 'node-ssh';

const config = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts',
  localAddress: '192.168.0.151',
  readyTimeout: 60000
};

const cmd = process.argv.slice(2).join(' ') || 'hostname';

const ssh = new NodeSSH();
async function run() {
  await ssh.connect({ ...config, readyTimeout: 60000 });
  console.log(`Executing: ${cmd}`);
  const result = await ssh.execCommand(cmd);
  console.log(`Exit code: ${result.code}`);
  if (result.stdout) process.stdout.write(result.stdout + '\n');
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  ssh.dispose();
}

run().catch(err => {
  console.error('SSH Error:', err);
  process.exit(1);
});

