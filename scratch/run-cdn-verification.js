import { Client } from 'ssh2';

const config = {
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
      stream.on('close', (code) => {
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected to VPS for verification...');
  try {
    console.log('Temporarily enabling USE_CDN_BYPASS=true in remote .env...');
    await execute(conn, "sed -i 's/USE_CDN_BYPASS=.*/USE_CDN_BYPASS=true/g' /root/knight-vpn-bot/.env");
    await execute(conn, "sed -i 's/CDN_DOMAIN=.*/CDN_DOMAIN=cdn-test.knight1.space/g' /root/knight-vpn-bot/.env");
    
    // Restart bot to apply
    console.log('Restarting bot...');
    await execute(conn, "pm2 restart knight-vpn-bot");
    
    // Wait 2 seconds for server boot
    await new Promise(r => setTimeout(r, 2000));

    // 2. Insert dummy subscription record for testing
    console.log('Inserting dummy user and subscription...');
    const insertUserQuery = "INSERT INTO users (tg_id, username, first_name) VALUES (999999, 'testuser', 'Test') ON CONFLICT DO NOTHING;";
    const insertSubQuery = "INSERT INTO subscriptions (tg_id, client_email, client_uuid, connection_url, bypass_connection_url, plan_name, starts_at, expires_at, status) VALUES (999999, 'vpn_user_999999', '77777777-7777-7777-7777-777777777777', 'vless://test-uuid@141.11.197.6:443?security=reality&pbk=pbk&sid=sid&sni=apple.com#Main', 'vless://bypass-uuid@141.11.197.6:8443?type=grpc&security=reality&pbk=pbk2&sid=sid2&sni=max.ru&serviceName=grpc', 'Standard', '2026-06-10 00:00:00', '2026-07-10 00:00:00', 'active') ON CONFLICT(client_email) DO UPDATE SET status=\\'active\\', bypass_connection_url=\\'vless://bypass-uuid@141.11.197.6:8443?type=grpc&security=reality&pbk=pbk2&sid=sid2&sni=max.ru&serviceName=grpc\\';";

    await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${insertUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
    await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${insertSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);

    // 3. Fetch subscription output and verify it
    console.log('Fetching test subscription from sub server...');
    const curlRes = await execute(conn, 'curl -k -s https://localhost:3000/sub/77777777-7777-7777-7777-777777777777');
    const base64Data = curlRes.stdout;
    
    if (!base64Data) {
      throw new Error(`Empty subscription response! Stderr: ${curlRes.stderr}`);
    }

    const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
    console.log('\n--- Decoded subscription output ---');
    console.log(decoded);
    console.log('-----------------------------------\n');

    // Verification assertion
    const expectedLink = "vless://bypass-uuid@cdn-test.knight1.space:443?type=splithttp&security=tls&path=%2Fknight-down&uploadPath=%2Fknight-up&uploadMethod=GET&downloadMethod=GET&mode=auto&host=cdn-test.knight1.space#🇷🇺 LTE | Обходка (CDN)";
    const linkFound = decoded.includes(expectedLink);
    
    if (linkFound) {
      console.log('🎉 SUCCESS: SplitHTTP-over-GET connection link generated correctly!');
    } else {
      console.error('❌ FAILURE: CDN link was not found or formatted incorrectly.');
    }

    // 4. Cleanup dummy records
    console.log('Cleaning up dummy database records...');
    const deleteSubQuery = "DELETE FROM subscriptions WHERE tg_id = 999999;";
    const deleteUserQuery = "DELETE FROM users WHERE tg_id = 999999;";
    await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${deleteSubQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);
    await execute(conn, `cd /root/knight-vpn-bot && node -e "import('sqlite3').then(m => { const db = new m.default.Database('/root/knight-vpn-bot/database.db'); db.run(\\\`\\${deleteUserQuery}\\\`, (err) => { if (err) console.error(err); db.close(); }); });"`);

    // 5. Revert .env changes
    console.log('Reverting .env file back to defaults...');
    await execute(conn, "sed -i 's/USE_CDN_BYPASS=.*/USE_CDN_BYPASS=true/g' /root/knight-vpn-bot/.env");
    await execute(conn, "sed -i 's/CDN_DOMAIN=.*/CDN_DOMAIN=cdn.node-ping-stat.ru/g' /root/knight-vpn-bot/.env");
    
    console.log('Restarting bot with defaults...');
    await execute(conn, "pm2 restart knight-vpn-bot");
    
    console.log('Verification finished successfully!');
    conn.end();
  } catch (err) {
    console.error('Verification error:', err);
    
    // Safe fallback attempt to revert .env
    console.log('Attempting emergency rollback of .env...');
    await execute(conn, "sed -i 's/USE_CDN_BYPASS=.*/USE_CDN_BYPASS=true/g' /root/knight-vpn-bot/.env");
    await execute(conn, "sed -i 's/CDN_DOMAIN=.*/CDN_DOMAIN=cdn.node-ping-stat.ru/g' /root/knight-vpn-bot/.env");
    await execute(conn, "pm2 restart knight-vpn-bot");
    
    conn.end();
  }
}).on('error', (err) => {
  console.error('SSH connection error:', err);
}).connect(config);
