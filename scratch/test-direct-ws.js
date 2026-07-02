import http from 'http';
import crypto from 'crypto';

const host = '141.11.197.6';
const path = '/knight-ws';

function testUpgradeDirect() {
  return new Promise((resolve) => {
    const key = crypto.randomBytes(16).toString('base64');

    const options = {
      hostname: host,
      port: 80,
      path: path,
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        'Host': 'cdn.node-ping-stat.ru' // Use the same host header
      }
    };

    console.log(`Initiating DIRECT WebSocket upgrade request to http://${host}${path}...`);

    const req = http.request(options);

    req.on('upgrade', (res, socket, upgradeHead) => {
      console.log('🟢 Direct WebSocket Upgrade SUCCESS!');
      console.log('   Status Code:', res.statusCode);
      console.log('   Headers:', res.headers);
      socket.destroy();
      resolve(true);
    });

    req.on('response', (res) => {
      console.log('🔴 Direct Upgrade Failed: Server returned normal response instead of upgrade.');
      console.log('   Status Code:', res.statusCode);
      console.log('   Headers:', res.headers);
      resolve(false);
    });

    req.on('error', (err) => {
      console.log('🔴 Direct Upgrade Request Error:', err.message);
      resolve(false);
    });

    req.end();
  });
}

testUpgradeDirect();
