import { NodeSSH } from 'node-ssh';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const sshConfig = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const ssh = new NodeSSH();

async function run() {
  console.log('Connecting to VPS...');
  await ssh.connect(sshConfig);
  console.log('✅ Connected.');

  const localConf = path.join(projectRoot, 'scratch', 'nginx-xhttp.conf');
  const remoteConf = '/etc/nginx/sites-available/default';

  // 1. Back up existing nginx config
  console.log('Backing up old config...');
  await ssh.execCommand('cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak-proxy-pass || true');

  // 2. Upload new config
  console.log(`Uploading local ${localConf} -> remote ${remoteConf}...`);
  await ssh.putFile(localConf, remoteConf);

  // 3. Test nginx configuration
  console.log('Testing nginx configuration...');
  const testRes = await ssh.execCommand('nginx -t');
  console.log(testRes.stdout || testRes.stderr);

  if (testRes.code === 0) {
    console.log('Nginx config is OK. Reloading Nginx service...');
    const reloadRes = await ssh.execCommand('systemctl reload nginx');
    console.log(reloadRes.stdout || reloadRes.stderr || '✅ Nginx reloaded successfully.');
  } else {
    console.error('❌ Nginx configuration test failed! Restoring backup...');
    await ssh.execCommand('cp /etc/nginx/sites-available/default.bak-proxy-pass /etc/nginx/sites-available/default');
    console.log('Restored old config.');
  }

  ssh.dispose();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});