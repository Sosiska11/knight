import { Client } from 'ssh2';

const host = '127.0.0.1';
const password = 'aSE2VhyajWS2d';
const ports = [16605, 2222, 22];

async function tryConnect(port) {
  return new Promise((resolve) => {
    console.log(`Trying ${host}:${port}...`);
    const conn = new Client();
    conn.on('ready', () => {
      console.log(`✅ SUCCESS on port ${port}!`);
      conn.end();
      resolve(true);
    }).on('error', (err) => {
      console.log(`❌ FAILED on port ${port}: ${err.message}`);
      resolve(false);
    }).connect({
      host,
      port,
      username: 'root',
      password,
      readyTimeout: 10000
    });
  });
}

async function main() {
  for (const port of ports) {
    const ok = await tryConnect(port);
    if (ok) break;
  }
}

main().catch(console.error);
