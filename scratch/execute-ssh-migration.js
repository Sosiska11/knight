import { Client } from 'ssh2';

const config = {
  host: '127.0.0.1',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

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
  console.log('✅ Connected to Russian VPS...');
  try {
    const migrationScript = `#!/bin/bash
set -e

echo "=== 1. Installing sslh ==="
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" sslh

echo "=== 2. Configuring sslh ==="
cat << 'EOF' > /etc/default/sslh
# Default options for sslh

# The daemon can run in "standalone" mode (default) or "inetd" mode.
RUN=yes

# daemon to use: 'sslh' or 'sslh-select'
DAEMON=sslh

# Listen on port 22 on all interfaces (where NAT forwards external 16605)
# Forward SSH to 127.0.0.1:2222
# Forward SSL/TLS to 141.11.197.6:8443 (NL VPS Reality port)
DAEMON_OPTS="--user sslh --listen 0.0.0.0:22 --ssh 127.0.0.1:2222 --ssl 141.11.197.6:8443 --pidfile /var/run/sslh/sslh.pid"
EOF

echo "=== 3. Configuring SSH Port to 2222 ==="
mkdir -p /etc/ssh/sshd_config.d
echo "Port 2222" > /etc/ssh/sshd_config.d/99-custom-port.conf

echo "=== 4. Reorganizing systemd services ==="
# Stop and disable systemd socket activation for ssh
systemctl stop ssh.socket || true
systemctl disable ssh.socket || true
systemctl daemon-reload

# Start ssh daemon on port 2222
systemctl enable ssh
systemctl restart ssh

# Enable and start sslh on port 22
systemctl enable sslh
systemctl restart sslh

echo "=== 5. Verification ==="
echo "Checking listening sockets:"
ss -tulnp | grep -E "ssh|sslh" || true

echo "🎉 Migration complete successfully!"
`;

    // Upload script
    const escScript = migrationScript.replace(/'/g, "'\\''");
    await executeCommand(conn, `cat << 'EOF' > /tmp/migrate-ssh.sh\n${escScript}\nEOF`);
    await executeCommand(conn, 'chmod +x /tmp/migrate-ssh.sh');
    
    // Run script
    console.log('\n--- Running migration script ---');
    await executeCommand(conn, '/tmp/migrate-ssh.sh');

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
