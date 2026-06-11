import { Client } from 'ssh2';

const sshConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

function execute(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', () => {
        if (stderr.trim()) {
          console.error(`[STDERR for "${cmd}"]:`, stderr.trim());
        }
        resolve(stdout.trim());
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

async function run() {
  try {
    const conn = new Client();
    conn.on('ready', async () => {
      try {
        console.log('✅ Connected to VPS...');
        
        // 1. Insert dummy records
        console.log('Inserting dummy user and subscription...');
        const insertUserQuery = "INSERT INTO users (tg_id, username, first_name) VALUES (999999, 'testuser', 'Test') ON CONFLICT DO NOTHING;";
        const insertSubQuery = "INSERT INTO subscriptions (tg_id, client_email, client_uuid, connection_url, plan_name, starts_at, expires_at, status) VALUES (999999, 'vpn_user_999999', '77777777-7777-7777-7777-777777777777', 'vless://test-uuid@141.11.197.6:443?security=reality&pbk=pbk&sid=sid&sni=apple.com#Main', 'Standard', '2026-06-10 00:00:00', '2026-07-10 00:00:00', 'active') ON CONFLICT(client_email) DO UPDATE SET status=\\'active\\';";

        await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${insertUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
        await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${insertSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);

        const selectQuery = "SELECT * FROM subscriptions WHERE client_uuid = '77777777-7777-7777-7777-777777777777';";
        const insertedRecord = await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.get(\\\`\\${selectQuery}\\\`, (err, row) => { if (err) console.error(err); else console.log(JSON.stringify(row)); db.close(); }); });"`);
        console.log("Inserted Record:", insertedRecord);

        // 2. Fetch subscription
        console.log('Fetching subscription...');
        const base64Data = await execute(conn, 'curl -k -s https://localhost:3000/sub/77777777-7777-7777-7777-777777777777');
        console.log('\n--- Raw subscription response: ---');
        console.log(base64Data);

        const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
        
        console.log('\n=== Decoded subscription content: ---');
        console.log(decoded);
        console.log('=====================================\n');

        // 3. Clean up
        console.log('Cleaning up dummy records...');
        const deleteSubQuery = "DELETE FROM subscriptions WHERE tg_id = 999999;";
        const deleteUserQuery = "DELETE FROM users WHERE tg_id = 999999;";
        await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${deleteSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
        await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${deleteUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
        
        console.log('Done!');
        conn.end();
      } catch (err) {
        console.error(err);
        conn.end();
      }
    }).connect(sshConfig);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
