import WebSocket from 'ws';

const url = 'wss://d5dppna7jrcjlkqf35tp.y3q8o1jq.apigw.yandexcloud.net/knight-ws';

console.log(`Connecting to WebSocket: ${url}...`);

const ws = new WebSocket(url, {
  rejectUnauthorized: false
});

ws.on('open', () => {
  console.log('🟢 Real WebSocket Connection OPENED successfully!');
  ws.close();
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed. Code: ${code}, Reason: ${reason}`);
});

ws.on('error', (err) => {
  console.error('🔴 WebSocket Error:', err.message);
});
