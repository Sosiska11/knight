import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });

  // The 3x-ui internal subscription is on port 2096, path /sub/
  const subId = '9ec63576-60fb-4910-973d-5ea0a3257c62';
  
  // Try fetching 3x-ui internal subscription on port 2096
  console.log('=== 3x-ui internal subscription (port 2096) ===');
  const sub1 = await ssh.execCommand(`curl -sk "https://localhost:2096/sub/${subId}" 2>&1`);
  console.log('Response:', sub1.stdout.substring(0, 500));
  
  // Also try HTTP
  console.log('\n=== 3x-ui internal subscription (port 2096 HTTP) ===');
  const sub2 = await ssh.execCommand(`curl -s "http://localhost:2096/sub/${subId}" 2>&1`);
  console.log('Response:', sub2.stdout.substring(0, 500));
  
  // Check ss -tlnp for port 2096
  console.log('\n=== Port 2096 listener ===');
  const port = await ssh.execCommand('ss -tlnp | grep 2096');
  console.log(port.stdout || '(nothing)');

  // The sub might be encrypted. Let me check what 3x-ui Go source does with subEncrypt=true
  // Let me try base64 decode
  if (sub2.stdout && sub2.stdout.length > 10 && !sub2.stdout.startsWith('curl') && !sub2.stdout.startsWith('<')) {
    try {
      const decoded = Buffer.from(sub2.stdout.trim(), 'base64').toString('utf-8');
      console.log('\n=== Decoded internal sub ===');
      console.log(decoded);
    } catch (e) {
      console.log('Not base64:', e.message);
    }
  }

  // Try JSON sub
  console.log('\n=== 3x-ui JSON subscription ===');
  const jsonSub = await ssh.execCommand(`curl -s "http://localhost:2096/json/${subId}" 2>&1`);
  console.log('Response (first 1000):', jsonSub.stdout.substring(0, 1000));

  // NOW, let me check: is the user using the custom sub-server URL or the 3x-ui internal sub URL in Hiddify?
  // Let me look at what the actual subscription link that's sent to the user looks like
  console.log('\n=== Bot database: how the sub URL is sent to user ===');
  const botSub = await ssh.execCommand(`python3 << 'PYEOF'
import sqlite3
conn = sqlite3.connect('/root/knight-vpn-bot/database.db')
cur = conn.cursor()
cur.execute("SELECT tg_id, client_email, client_uuid, connection_url, bypass_connection_url FROM subscriptions WHERE status='active'")
rows = cur.fetchall()
for row in rows:
    print(f"  tg_id={row[0]}, email={row[1]}")
    print(f"  uuid={row[2]}")
    print(f"  connection_url={row[3]}")
    print(f"  bypass_url={row[4]}")
    print()
conn.close()
PYEOF`);
  console.log(botSub.stdout || botSub.stderr);

  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
