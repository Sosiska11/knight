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

const pythonScript = fs.readFileSync(path.join(__dirname, 'scan-xray.py'), 'utf8');

const conn = new Client();
conn.on('ready', () => {
  console.log('✅ Connected to VPS...');
  conn.exec('python3', (err, stream) => {
    if (err) throw err;
    
    stream.on('close', (code) => {
      console.log(`\nExit code: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    // Write python script to stdin and close it
    stream.write(pythonScript);
    stream.end();
  });
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
