import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts' });
  console.log('✅ Connected to VPS');

  // Upload updated sub-server.js
  const subServerPath = path.join(__dirname, '..', 'src', 'sub-server.js');
  console.log('📤 Uploading sub-server.js...');
  await ssh.putFile(subServerPath, '/root/knight-vpn-bot/src/sub-server.js');
  console.log('✅ sub-server.js uploaded');

  // Update .env CDN_PATH to /knight-ws (the path Xray listens on, which API Gateway catch-all will forward)
  console.log('📝 Updating .env on VPS...');
  const envResult = await ssh.execCommand('cat /root/knight-vpn-bot/.env');
  let envContent = envResult.stdout;
  
  // Make sure CDN_PATH is /knight-ws
  if (envContent.includes('CDN_PATH=')) {
    envContent = envContent.replace(/CDN_PATH=.*/, 'CDN_PATH=/knight-ws');
  }
  
  await ssh.execCommand(`cat > /root/knight-vpn-bot/.env << 'ENVEOF'
${envContent}
ENVEOF`);
  console.log('✅ .env updated');

  // Restart the bot
  console.log('🔄 Restarting bot...');
  const restart = await ssh.execCommand('cd /root/knight-vpn-bot && pm2 restart knight-vpn-bot');
  console.log(restart.stdout || restart.stderr);

  // Wait and check
  await new Promise(r => setTimeout(r, 3000));
  const status = await ssh.execCommand('pm2 status');
  console.log(status.stdout);

  // Test subscription output
  console.log('\n📋 Testing subscription output...');
  const subTest = await ssh.execCommand('curl -s https://knight1.space:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f -k | base64 -d');
  console.log(subTest.stdout);

  ssh.dispose();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
