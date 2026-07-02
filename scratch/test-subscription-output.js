import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Connecting attempt ${i+1}...`);
      await ssh.connect({
        host: '141.11.197.6',
        username: 'root',
        password: 'IxJlIDug5LW5mF5ghOts',
        localAddress: '192.168.0.151',
        readyTimeout: 30000
      });
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
  
  try {
    console.log('✅ Connected to VPS...');
    
    // 1. Insert dummy records
    console.log('Inserting dummy user and subscription...');
    const insertUserQuery = "INSERT INTO users (tg_id, username, first_name) VALUES (999999, 'testuser', 'Test') ON CONFLICT DO NOTHING;";
    const insertSubQuery = "INSERT INTO subscriptions (tg_id, client_email, client_uuid, connection_url, bypass_connection_url, plan_name, starts_at, expires_at, status) VALUES (999999, 'vpn_user_999999', '77777777-7777-7777-7777-777777777777', 'vless://test-uuid@141.11.197.6:443?security=reality&pbk=pbk&sid=sid&sni=apple.com#Main', 'vless://bypass-uuid@141.11.197.6:8443?type=grpc&security=reality&pbk=pbk2&sid=sid2&sni=max.ru&serviceName=grpc', 'Standard', '2026-06-10 00:00:00', '2026-07-10 00:00:00', 'active') ON CONFLICT(client_email) DO UPDATE SET status='active', bypass_connection_url='vless://bypass-uuid@141.11.197.6:8443?type=grpc&security=reality&pbk=pbk2&sid=sid2&sni=max.ru&serviceName=grpc';";

    await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`${insertUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
    await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`${insertSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);

    const selectQuery = "SELECT * FROM subscriptions WHERE client_uuid = '77777777-7777-7777-7777-777777777777';";
    const insertedRecord = await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.get(\\\`${selectQuery}\\\`, (err, row) => { if (err) console.error(err); else console.log(JSON.stringify(row)); db.close(); }); });"`);
    console.log("Inserted Record:", insertedRecord.stdout || insertedRecord.stderr);

    // 2. Fetch subscription
    console.log('Fetching subscription...');
    // We curl localhost:3000 to fetch it
    const base64Res = await ssh.execCommand('curl -k -s https://localhost:3000/sub/77777777-7777-7777-7777-777777777777');
    console.log('\n--- Raw subscription response: ---');
    const base64Data = base64Res.stdout.trim();
    console.log(base64Data || '(empty response!)');

    if (base64Data) {
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      console.log('\n=== Decoded subscription content: ---');
      console.log(decoded);
      console.log('=====================================\n');
    }

    // 3. Clean up
    console.log('Cleaning up dummy records...');
    const deleteSubQuery = "DELETE FROM subscriptions WHERE tg_id = 999999;";
    const deleteUserQuery = "DELETE FROM users WHERE tg_id = 999999;";
    await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`${deleteSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
    await ssh.execCommand(`cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`${deleteUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
    
    console.log('Done!');
  } catch (err) {
    console.error(err);
  } finally {
    ssh.dispose();
  }
}

run();
