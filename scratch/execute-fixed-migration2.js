import { Client } from 'ssh2';

const config = {
  host: '127.0.0.1',
  port: 16605, // Connects to SSH currently listening on port 22
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

function uploadFileSFTP(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile(remotePath, content, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to Russian VPS for migration...');
  try {
    const migrationScript = `#!/bin/bash
set -e

echo "=== 1. Configuring sslh (WITHOUT pidfile to support systemd DynamicUser) ==="
cat << 'MIGRATE_EOF' > /etc/default/sslh
# Default options for sslh

# The daemon can run in "standalone" mode (default) or "inetd" mode.
RUN=yes

# daemon to use: 'sslh' or 'sslh-select'
DAEMON=sslh

# Listen on port 22 on all interfaces (where NAT forwards external 16605)
# Forward SSH to 127.0.0.1:2222
# Forward SSL/TLS to 141.11.197.6:8443 (NL VPS Reality port)
DAEMON_OPTS="--user sslh --listen 0.0.0.0:22 --ssh 127.0.0.1:2222 --tls 141.11.197.6:8443"
MIGRATE_EOF

echo "=== 2. Configuring SSH Port to 2222 ==="
mkdir -p /etc/ssh/sshd_config.d
echo "Port 2222" > /etc/ssh/sshd_config.d/99-custom-port.conf

echo "=== 3. Completely disabling systemd socket activation for SSH ==="
systemctl stop ssh.socket || true
systemctl disable ssh.socket || true
systemctl mask ssh.socket || true

echo "=== 4. Enabling and starting ssh daemon on port 2222 ==="
systemctl daemon-reload
systemctl enable ssh
systemctl restart ssh

echo "=== 5. Enabling and starting sslh on port 22 ==="
systemctl enable sslh
systemctl restart sslh

echo "=== 6. Verification ==="
echo "Checking listening sockets (should show ssh on 2222 and sslh on 22):"
sleep 2
ss -tulnp | grep -E "ssh|sslh" || true

echo "🎉 Migration completed successfully!"
`;

    // Upload script via SFTP
    console.log('Uploading migration script via SFTP...');
    await uploadFileSFTP(conn, '/tmp/migrate-ssh-fixed2.sh', migrationScript);
    await executeCommand(conn, 'chmod +x /tmp/migrate-ssh-fixed2.sh');
    
    // Run script
    console.log('\n--- Running migration script ---');
    const runRes = await executeCommand(conn, '/tmp/migrate-ssh-fixed2.sh');
    console.log('\nMigration execution finished.');

    conn.end();
  } catch (err) {
    console.error('Error during migration execution:', err);
    conn.end();
  }
}).connect(config);
