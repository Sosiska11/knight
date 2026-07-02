import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts', readyTimeout: 30000 });

  // Update existing subscription URLs in the database to add encryption=none
  console.log('=== Updating existing subscription URLs ===');
  const result = await ssh.execCommand(`python3 << 'PYEOF'
import sqlite3, re

conn = sqlite3.connect('/root/knight-vpn-bot/database.db')
cur = conn.cursor()

# Get all active subscriptions
cur.execute("SELECT id, connection_url, bypass_connection_url FROM subscriptions WHERE status='active'")
rows = cur.fetchall()

updated = 0
for row_id, conn_url, bypass_url in rows:
    new_conn_url = conn_url
    new_bypass_url = bypass_url
    
    # Add encryption=none to connection_url if it's a vless:// link and doesn't have it
    if conn_url and conn_url.startswith('vless://') and 'encryption=' not in conn_url:
        # Insert encryption=none after the ? 
        new_conn_url = conn_url.replace('?', '?encryption=none&', 1)
    
    # Add encryption=none to bypass_connection_url if applicable
    if bypass_url and bypass_url.startswith('vless://') and 'encryption=' not in bypass_url:
        new_bypass_url = bypass_url.replace('?', '?encryption=none&', 1)
    
    if new_conn_url != conn_url or new_bypass_url != bypass_url:
        cur.execute(
            "UPDATE subscriptions SET connection_url=?, bypass_connection_url=? WHERE id=?",
            (new_conn_url, new_bypass_url, row_id)
        )
        updated += 1
        print(f"  Updated subscription id={row_id}")
        print(f"    OLD: {conn_url[:120]}...")
        print(f"    NEW: {new_conn_url[:120]}...")

conn.commit()
conn.close()
print(f"\\nDone. Updated {updated} subscriptions.")
PYEOF`);
  console.log(result.stdout);
  if (result.stderr) console.error('STDERR:', result.stderr);

  // Verify the update
  console.log('\n=== Verification ===');
  const verify = await ssh.execCommand(`python3 << 'PYEOF'
import sqlite3
conn = sqlite3.connect('/root/knight-vpn-bot/database.db')
cur = conn.cursor()
cur.execute("SELECT id, connection_url FROM subscriptions WHERE status='active'")
rows = cur.fetchall()
for row_id, url in rows:
    has_enc = 'encryption=' in (url or '')
    print(f"  id={row_id}: encryption=none present: {has_enc}")
    print(f"    URL: {url[:150]}")
conn.close()
PYEOF`);
  console.log(verify.stdout);

  ssh.dispose();
}

run().catch(e => { console.error(e.message); process.exit(1); });
