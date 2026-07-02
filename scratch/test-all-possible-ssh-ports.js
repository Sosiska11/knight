import { Client } from 'ssh2';

const host = '79.137.162.56';
const password = 'aSE2VhyajWS2d';
const ports = [80, 443, 22, 2222, 16605];

function tryConnect(port) {
  return new Promise((resolve) => {
    console.log(`\n--- Trying SSH on ${host}:${port} ---`);
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log(`✅ SSH SUCCESS on port ${port}!`);
      conn.end();
      resolve(true);
    });

    conn.on('error', (err) => {
      console.log(`❌ SSH FAILED on port ${port}: ${err.message}`);
      conn.end();
      resolve(false);
    });

    conn.connect({
      host,
      port,
      username: 'root',
      password,
      readyTimeout: 5000
    });
  });
}

async function main() {
  for (const port of ports) {
    const success = await tryConnect(port);
    if (success) {
      console.log(`🎉 Found working SSH port: ${port}`);
      break;
    }
  }
}

main().catch(console.error);
