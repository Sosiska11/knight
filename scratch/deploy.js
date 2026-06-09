import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const REMOTE_DIR = '/root/knight-vpn-bot';

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing remote command: ${cmd}`);
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

function sftpUpload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(`Uploading: ${localPath} -> ${remotePath}`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function sftpMkdir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      // Ignore if dir already exists
      resolve();
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ SSH Connection established successfully!');
  
  try {
    // 1. Create remote directories
    console.log('Creating remote directories...');
    await executeCommand(conn, `mkdir -p ${REMOTE_DIR}/src`);

    // 2. Start SFTP
    conn.sftp(async (err, sftp) => {
      if (err) throw err;

      try {
        // Upload root files
        const rootFiles = ['.env', 'index.js', 'package.json', 'banner.png', 'database.db'];
        for (const file of rootFiles) {
          const localPath = path.join(projectRoot, file);
          if (fs.existsSync(localPath)) {
            await sftpUpload(sftp, localPath, `${REMOTE_DIR}/${file}`);
          } else {
            console.log(`⚠️ Skip local file (does not exist): ${file}`);
          }
        }

        // Upload src directory files
        const srcDir = path.join(projectRoot, 'src');
        const srcFiles = fs.readdirSync(srcDir);
        for (const file of srcFiles) {
          const localPath = path.join(srcDir, file);
          if (fs.statSync(localPath).isFile()) {
            await sftpUpload(sftp, localPath, `${REMOTE_DIR}/src/${file}`);
          }
        }

        console.log('✅ File transfer completed successfully!');

        // 3. Environment setup & startup
        console.log('\n--- Checking Node.js ---');
        const nodeCheck = await executeCommand(conn, 'node -v').catch(() => ({ code: -1 }));
        
        if (nodeCheck.code !== 0) {
          console.log('Node.js is not installed. Installing Node.js v20 (LTS)...');
          await executeCommand(conn, 'apt-get update && apt-get install -y curl');
          await executeCommand(conn, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
          await executeCommand(conn, 'apt-get install -y nodejs');
        } else {
          console.log(`Node.js is already installed: ${nodeCheck.stdout.trim()}`);
        }

        console.log('\n--- Installing dependencies ---');
        await executeCommand(conn, `cd ${REMOTE_DIR} && npm install --production`);

        console.log('\n--- Checking PM2 ---');
        const pm2Check = await executeCommand(conn, 'pm2 -v').catch(() => ({ code: -1 }));
        if (pm2Check.code !== 0) {
          console.log('PM2 is not installed. Installing PM2 globally...');
          await executeCommand(conn, 'npm install -g pm2');
        } else {
          console.log(`PM2 is already installed: ${pm2Check.stdout.trim()}`);
        }

        console.log('\n--- Configuring Firewall ---');
        await executeCommand(conn, 'ufw allow 3000/tcp || true');
        await executeCommand(conn, 'iptables -A INPUT -p tcp --dport 3000 -j ACCEPT || true');

        console.log('\n--- Starting Application ---');
        // Stop if running, then start
        await executeCommand(conn, `pm2 delete knight-vpn-bot || true`);
        await executeCommand(conn, `cd ${REMOTE_DIR} && pm2 start index.js --name "knight-vpn-bot"`);
        await executeCommand(conn, 'pm2 save');
        await executeCommand(conn, 'pm2 startup || true');

        console.log('\n🚀 DEPLOYMENT COMPLETED SUCCESSFULLY!');
        conn.end();
      } catch (uploadError) {
        console.error('❌ Error during file transfer/setup:', uploadError);
        conn.end();
      }
    });

  } catch (err) {
    console.error('❌ Remote execution error:', err);
    conn.end();
  }
}).connect(config);
