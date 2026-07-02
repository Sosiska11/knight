import { Client } from 'ssh2';

const russianConfig = {
  host: '79.137.162.56',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

const mainVpsIp = '141.11.197.6';

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to Russian Transit VPS...');
  try {
    // 1. Enable IP Forwarding
    console.log('\n--- Ensuring IP Forwarding is active ---');
    await executeCommand(conn, 'sysctl -w net.ipv4.ip_forward=1');
    await executeCommand(conn, 'grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf');

    // 2. Clean up old rules to keep NAT table clean
    console.log('\n--- Cleaning up old port 8443, 80 rules ---');
    await executeCommand(conn, `iptables -t nat -D PREROUTING -p tcp --dport 8443 -j DNAT --to-destination ${mainVpsIp}:8443 2>/dev/null || true`);
    await executeCommand(conn, `iptables -t nat -D PREROUTING -p tcp --dport 80 -j DNAT --to-destination ${mainVpsIp}:8443 2>/dev/null || true`);
    await executeCommand(conn, `iptables -t nat -D POSTROUTING -p tcp -d ${mainVpsIp} --dport 8443 -j MASQUERADE 2>/dev/null || true`);

    // 3. Set up iptables port forwarding rules for port 16606
    console.log('\n--- Configuring iptables rules for port 16606 ---');
    // Clear any existing matching DNAT rules for port 16606 to avoid duplicates
    await executeCommand(conn, `iptables -t nat -D PREROUTING -p tcp --dport 16606 -j DNAT --to-destination ${mainVpsIp}:8443 2>/dev/null || true`);
    
    // Add DNAT rule for port 16606
    await executeCommand(conn, `iptables -t nat -A PREROUTING -p tcp --dport 16606 -j DNAT --to-destination ${mainVpsIp}:8443`);
    // Add MASQUERADE rule for NL VPS destination port 8443
    await executeCommand(conn, `iptables -t nat -A POSTROUTING -p tcp -d ${mainVpsIp} --dport 8443 -j MASQUERADE`);

    // 4. Make rules persistent
    console.log('\n--- Making iptables rules persistent ---');
    await executeCommand(conn, 'mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4');

    console.log('\n--- Current NAT Rules ---');
    await executeCommand(conn, 'iptables -t nat -S');

    console.log('\n🎉 Russian Transit VPS successfully configured to forward port 16606 to 8443!');
    conn.end();
  } catch (err) {
    console.error('❌ Error configuring Russian Transit VPS:', err.message);
    conn.end();
  }
}).connect(russianConfig);
