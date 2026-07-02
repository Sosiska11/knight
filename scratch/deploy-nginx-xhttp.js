import { NodeSSH } from 'node-ssh';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const ssh = new NodeSSH();

async function run() {
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Connecting attempt ${i+1}...`);
      await ssh.connect({
        host: '141.11.197.6',
        username: 'root',
        password: 'IxJlIDug5LW5mF5ghOts',
        localAddress: '192.168.0.151',
        readyTimeout: 60000
      });
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

  console.log('✅ Connected to VPS.');

  // Step 1: Backup current nginx default file if backup not exists
  console.log('Checking for nginx backup...');
  const backupCheck = await ssh.execCommand('ls /etc/nginx/sites-available/default.bak-xhttp');
  if (backupCheck.code !== 0) {
    console.log('Creating nginx backup at /etc/nginx/sites-available/default.bak-xhttp...');
    await ssh.execCommand('cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak-xhttp');
  } else {
    console.log('Nginx backup default.bak-xhttp already exists.');
  }

  // Step 2: Upload new nginx-xhttp.conf
  const localConfigPath = path.join(projectRoot, 'scratch', 'nginx-xhttp.conf');
  const remoteConfigPath = '/etc/nginx/sites-available/default';
  console.log(`Uploading ${localConfigPath} -> ${remoteConfigPath}...`);
  await ssh.putFile(localConfigPath, remoteConfigPath);
  console.log('Config file uploaded.');

  // Step 3: Test nginx config
  console.log('Testing nginx configuration...');
  const testNginx = await ssh.execCommand('nginx -t');
  console.log('Stdout:', testNginx.stdout);
  console.log('Stderr:', testNginx.stderr);

  if (testNginx.code === 0) {
    console.log('✅ Nginx configuration is OK. Reloading nginx...');
    const reloadNginx = await ssh.execCommand('systemctl reload nginx');
    console.log(reloadNginx.stdout || reloadNginx.stderr || 'Nginx reloaded successfully.');
  } else {
    console.error('❌ Nginx configuration test failed! Rolling back...');
    const rollback = await ssh.execCommand('cp /etc/nginx/sites-available/default.bak-xhttp /etc/nginx/sites-available/default');
    console.log(rollback.stdout || rollback.stderr || 'Nginx config rolled back.');
    ssh.dispose();
    process.exit(1);
  }

  // Step 4: Restart x-ui panel service
  console.log('Restarting x-ui panel service...');
  const restartXUI = await ssh.execCommand('systemctl restart x-ui');
  console.log(restartXUI.stdout || restartXUI.stderr || 'x-ui restarted successfully.');

  ssh.dispose();
  console.log('🎉 Nginx deployment completed successfully!');
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
