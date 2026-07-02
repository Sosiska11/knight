import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const localScriptPath = path.join(__dirname, 'create-cdn-inbound.js');
const remoteScriptPath = '/root/knight-vpn-bot/scratch/create-cdn-inbound.js';

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to VPS. Starting SFTP...');
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }
    
    console.log('Uploading script...');
    sftp.fastPut(localScriptPath, remoteScriptPath, (uploadErr) => {
      if (uploadErr) {
        console.error('Upload error:', uploadErr);
        conn.end();
        return;
      }
      
      console.log('Upload complete. Executing script on remote VPS...');
      conn.exec(`cd /root/knight-vpn-bot && node scratch/create-cdn-inbound.js`, (execErr, stream) => {
        if (execErr) {
          console.error('Exec error:', execErr);
          conn.end();
          return;
        }
        stream.on('close', (code) => {
          console.log(`Exit code: ${code}`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    });
  });
}).on('error', (err) => {
  console.error('SSH connection error:', err);
}).connect(config);
