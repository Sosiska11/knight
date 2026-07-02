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
  
  console.log('Modifying /root/knight-vpn-bot/.env to use API Gateway...');
  
  // Set CDN_DOMAIN to the Yandex API Gateway domain
  await ssh.execCommand("sed -i 's/CDN_DOMAIN=.*/CDN_DOMAIN=d5dppna7jrcjlkqf35tp.y3q8o1jq.apigw.yandexcloud.net/g' /root/knight-vpn-bot/.env");
  // Set CDN_PATH to /knight-ws
  await ssh.execCommand("sed -i 's/CDN_PATH=.*/CDN_PATH=\\/knight-ws/g' /root/knight-vpn-bot/.env");
  // Set USE_CDN_BYPASS to true
  await ssh.execCommand("sed -i 's/USE_CDN_BYPASS=.*/USE_CDN_BYPASS=true/g' /root/knight-vpn-bot/.env");

  console.log('Restarting PM2 process...');
  const restart = await ssh.execCommand('pm2 restart knight-vpn-bot');
  console.log(restart.stdout || restart.stderr);

  console.log('Verifying .env values:');
  const check = await ssh.execCommand('grep -E "CDN_DOMAIN|CDN_PATH|USE_CDN_BYPASS" /root/knight-vpn-bot/.env');
  console.log(check.stdout);

  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
