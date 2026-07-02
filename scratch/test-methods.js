import https from 'https';
import http from 'http';
import { Client } from 'ssh2';

// 1. Test POST request to CDN
function testCdnPost() {
  return new Promise((resolve) => {
    console.log('--- Testing POST to Yandex CDN (https://cdn.node-ping-stat.ru/knight-down) ---');
    const options = {
      hostname: 'cdn.node-ping-stat.ru',
      port: 443,
      path: '/knight-down',
      method: 'POST',
      localAddress: '192.168.0.151',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '5'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`CDN POST Status Code: ${res.statusCode}`);
      console.log('CDN POST Headers:', JSON.stringify(res.headers, null, 2));
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        console.log('CDN POST Response:', data);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error('CDN POST Error:', e.message);
      resolve();
    });

    req.write('hello');
    req.end();
  });
}

// 2. Test POST request directly to Nginx via VPS SSH (internal localhost request)
const sshConfig = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

function testNginxLocalPost() {
  return new Promise((resolve) => {
    console.log('\n--- Testing POST directly to Nginx on VPS (http://127.0.0.1/knight-down) ---');
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec('curl -i -X POST -d "hello" -H "Host: cdn.node-ping-stat.ru" -H "Content-Type: application/octet-stream" http://127.0.0.1/knight-down', (err, stream) => {
        if (err) {
          console.error(err);
          conn.end();
          return resolve();
        }
        stream.on('data', (d) => process.stdout.write(d.toString()));
        stream.on('close', () => {
          conn.end();
          resolve();
        });
      });
    }).on('error', (e) => {
      console.error('SSH connection failed:', e.message);
      resolve();
    }).connect(sshConfig);
  });
}

async function run() {
  await testCdnPost();
  await testNginxLocalPost();
}

run();
