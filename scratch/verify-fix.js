import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });

  // Wait a moment for the app to fully start
  await new Promise(r => setTimeout(r, 3000));

  const uuid = '0803d6f0-d419-4368-a8b2-b9bdb287784f';
  
  console.log('=== Fetching subscription after deploy ===');
  const result = await ssh.execCommand(`curl -sk https://localhost:3000/sub/${uuid}`);
  
  if (result.stdout) {
    const decoded = Buffer.from(result.stdout.trim(), 'base64').toString('utf-8');
    console.log('\n=== Decoded subscription configs ===');
    const lines = decoded.split('\n').filter(l => l.trim());
    console.log(`Total configs: ${lines.length}\n`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      console.log(`--- Config ${i + 1} ---`);
      console.log(line);
      
      // Check for encryption=none
      const hasEncryption = line.includes('encryption=none');
      console.log(`  ✅ encryption=none: ${hasEncryption ? 'YES' : '❌ MISSING'}`);
      console.log();
    }
  } else {
    console.log('Empty response!');
    console.log('stderr:', result.stderr);
    
    // Check PM2 logs
    console.log('\n=== PM2 error logs ===');
    const logs = await ssh.execCommand('pm2 logs knight-vpn-bot --lines 20 --nostream 2>/dev/null');
    console.log(logs.stdout || logs.stderr);
  }

  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
