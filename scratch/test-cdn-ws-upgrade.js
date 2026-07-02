import https from 'https';
import crypto from 'crypto';

const host = 'cdn.node-ping-stat.ru';
const path = '/knight-ws';

function testUpgrade() {
  return new Promise((resolve) => {
    // Generate a random Sec-WebSocket-Key
    const key = crypto.randomBytes(16).toString('base64');

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        'Host': host
      },
      rejectUnauthorized: false
    };

    console.log(`Initiating WebSocket upgrade request to https://${host}${path}...`);

    const req = https.request(options);

    req.on('upgrade', (res, socket, upgradeHead) => {
      console.log('🟢 WebSocket Upgrade SUCCESS!');
      console.log('   Status Code:', res.statusCode);
      console.log('   Headers:', res.headers);
      socket.destroy();
      resolve(true);
    });

    req.on('response', (res) => {
      console.log('🔴 Upgrade Failed: Server returned normal response instead of upgrade.');
      console.log('   Status Code:', res.statusCode);
      console.log('   Headers:', res.headers);
      resolve(false);
    });

    req.on('error', (err) => {
      console.log('🔴 Upgrade Request Error:', err.message);
      resolve(false);
    });

    req.end();
  });
}

testUpgrade();
