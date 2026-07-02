import { NodeSSH } from 'node-ssh';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const VPS_HOST = '141.11.197.6';
const VPS_USER = 'root';
const VPS_PASS = 'IxJlIDug5LW5mF5ghOts';

async function run() {
  const ssh = new NodeSSH();
  
  console.log('🔌 Connecting to VPS...');
  await ssh.connect({ host: VPS_HOST, username: VPS_USER, password: VPS_PASS });
  console.log('✅ Connected!');

  console.log('\n--- Checking yc CLI on VPS ---');
  const ycCheck = await ssh.execCommand('yc config list');
  console.log('yc config list status:', ycCheck.code);
  console.log('Stdout:', ycCheck.stdout);
  console.log('Stderr:', ycCheck.stderr);

  console.log('\n--- Checking yc version ---');
  const ycVer = await ssh.execCommand('yc --version');
  console.log('yc --version:', ycVer.stdout || ycVer.stderr);

  console.log('\n--- Checking environment variables on VPS ---');
  const envCheck = await ssh.execCommand('env');
  console.log('Env variables:', envCheck.stdout);

  ssh.dispose();
}

run().catch(err => {
  console.error('Error:', err);
});
