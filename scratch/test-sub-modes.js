import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });

  const uuid = '0803d6f0-d419-4368-a8b2-b9bdb287784f';
  
  const testModes = ['clean', 'de', 'ru'];
  
  for (const mode of testModes) {
    console.log(`\n=============================================`);
    console.log(`Fetching subscription with ?test=${mode}...`);
    console.log(`=============================================`);
    
    const result = await ssh.execCommand(`curl -sk "https://localhost:3000/sub/${uuid}?test=${mode}"`);
    
    if (result.stdout) {
      const decoded = Buffer.from(result.stdout.trim(), 'base64').toString('utf-8');
      const lines = decoded.split('\n').filter(l => l.trim());
      console.log(`Decoded count: ${lines.length} VLESS URLs`);
      
      lines.forEach((line, idx) => {
        console.log(`  [Config ${idx + 1}] -> ${line}`);
      });
    } else {
      console.log('  Error/Empty response!');
      console.log('  stderr:', result.stderr);
    }
  }

  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
