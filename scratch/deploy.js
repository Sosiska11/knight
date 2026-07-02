import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const config = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const REMOTE_DIR = '/root/knight-vpn-bot';

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

  console.log('✅ Connected to VPS.');

  // 1. Create remote directories
  console.log('Creating remote directories...');
  await ssh.execCommand(`mkdir -p ${REMOTE_DIR}/src ${REMOTE_DIR}/scratch`);

  // 2. Upload files
  const rootFiles = ['.env', 'index.js', 'package.json', 'banner.png'];
  for (const file of rootFiles) {
    const localPath = path.join(projectRoot, file);
    if (fs.existsSync(localPath)) {
      console.log(`Uploading: ${file} -> ${REMOTE_DIR}/${file}`);
      await ssh.putFile(localPath, `${REMOTE_DIR}/${file}`);
    } else {
      console.log(`⚠️ Skip local file (does not exist): ${file}`);
    }
  }

  // Upload src directory files
  const srcDir = path.join(projectRoot, 'src');
  const srcFiles = fs.readdirSync(srcDir);
  for (const file of srcFiles) {
    const localPath = path.join(srcDir, file);
    if (fs.statSync(localPath).isFile()) {
      console.log(`Uploading: src/${file} -> ${REMOTE_DIR}/src/${file}`);
      await ssh.putFile(localPath, `${REMOTE_DIR}/src/${file}`);
    }
  }

  // Upload scratch files
  const scratchFiles = ['migrate-all-bypass.js', 'configure-tcp-bypass-inbound.js', 'create-cdn-inbound.js', 'create-xhttp-inbound.js', 'create-xhttp-get-inbound.js', 'create-splithttp-inbound.js', 'test-splithttp-capabilities.js', 'diag-inbounds.js', 'diag-xhttp-capabilities.js', 'check-uuids-vps.js'];
  for (const file of scratchFiles) {
    const localPath = path.join(projectRoot, 'scratch', file);
    if (fs.existsSync(localPath)) {
      console.log(`Uploading: scratch/${file} -> ${REMOTE_DIR}/scratch/${file}`);
      await ssh.putFile(localPath, `${REMOTE_DIR}/scratch/${file}`);
    }
  }

  console.log('✅ File transfer completed successfully!');

  // 3. Environment setup & startup
  console.log('\n--- Checking Node.js ---');
  const nodeCheck = await ssh.execCommand('node -v');
  if (nodeCheck.code !== 0) {
    console.log('Node.js is not installed. Installing Node.js v20 (LTS)...');
    await ssh.execCommand('apt-get update && apt-get install -y curl');
    await ssh.execCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
    await ssh.execCommand('apt-get install -y nodejs');
  } else {
    console.log(`Node.js is already installed: ${nodeCheck.stdout.trim()}`);
  }

  console.log('\n--- Installing dependencies ---');
  await ssh.execCommand(`cd ${REMOTE_DIR} && npm install --production`);

  console.log('\n--- Checking PM2 ---');
  const pm2Check = await ssh.execCommand('pm2 -v');
  if (pm2Check.code !== 0) {
    console.log('PM2 is not installed. Installing PM2 globally...');
    await ssh.execCommand('npm install -g pm2');
  } else {
    console.log(`PM2 is already installed: ${pm2Check.stdout.trim()}`);
  }

  console.log('\n--- Configuring Firewall ---');
  await ssh.execCommand('ufw allow 3000/tcp || true');
  await ssh.execCommand('iptables -A INPUT -p tcp --dport 3000 -j ACCEPT || true');

  console.log('\n--- Starting Application ---');
  await ssh.execCommand(`pm2 delete knight-vpn-bot || true`);
  const startBot = await ssh.execCommand(`cd ${REMOTE_DIR} && pm2 start index.js --name "knight-vpn-bot"`);
  console.log(startBot.stdout || startBot.stderr);
  await ssh.execCommand('pm2 save');
  await ssh.execCommand('pm2 startup || true');

  console.log('\n🚀 DEPLOYMENT COMPLETED SUCCESSFULLY!');
  ssh.dispose();
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
