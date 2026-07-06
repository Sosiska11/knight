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
  password: 'IxJlIDug5LW5mF5ghOts',
  readyTimeout: 30000
};

const REMOTE_DIR = '/root/knight-vpn-bot';

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data.toString());
      }).stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data.toString());
      });
    });
  });
}

function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(`Uploading: ${localPath} -> ${remotePath}`);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);
      
      writeStream.on('close', () => {
        console.log('✅ Upload completed successfully.');
        resolve();
      });
      
      writeStream.on('error', (err) => {
        reject(err);
      });
      
      readStream.pipe(writeStream);
    });
  });
}

async function startDeployment(conn) {
  try {
    // 1. Create directory if not exists
    await executeCommand(conn, `mkdir -p ${REMOTE_DIR}`);

    // 2. Upload project.tar.gz
    const localTar = path.join(projectRoot, 'project.tar.gz');
    await uploadFile(conn, localTar, `${REMOTE_DIR}/project.tar.gz`);

    // 3. Extract tarball
    console.log('Extracting archive on remote VPS...');
    const extractRes = await executeCommand(conn, `tar -xzf ${REMOTE_DIR}/project.tar.gz -C ${REMOTE_DIR}`);
    if (extractRes.code !== 0) {
      throw new Error(`Failed to extract tarball on VPS: ${extractRes.stderr}`);
    }

    // 4. Remove tarball
    await executeCommand(conn, `rm ${REMOTE_DIR}/project.tar.gz`);

    // 5. Install dependencies
    console.log('\n--- Installing dependencies ---');
    await executeCommand(conn, `cd ${REMOTE_DIR} && npm install --production`);

    // 6. Restart PM2 process
    console.log('\n--- Restarting Application ---');
    await executeCommand(conn, `pm2 restart knight-vpn-bot || pm2 start index.js --name "knight-vpn-bot"`);
    
    console.log('\n🚀 DEPLOYMENT COMPLETED SUCCESSFULLY!');
    conn.end();
  } catch (err) {
    console.error('❌ Deployment error:', err.message);
    conn.end();
    process.exit(1);
  }
}

async function connectWithRetries(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Connecting attempt ${attempt}...`);
      await new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
          console.log('✅ Connected to VPS via raw SSH...');
          startDeployment(conn).then(resolve).catch(reject);
        }).on('error', (err) => {
          reject(err);
        }).connect(config);
      });
      return; // Success, exit retry loop
    } catch (e) {
      console.log(`Connection failed: ${e.message}`);
      if (attempt === maxAttempts) {
        console.error('❌ Failed to connect to VPS after max attempts.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

connectWithRetries();
