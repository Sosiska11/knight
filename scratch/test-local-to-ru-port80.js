import net from 'net';

const client = new net.Socket();

console.log('Connecting to 127.0.0.1:80...');
client.setTimeout(5000);

client.connect(80, '127.0.0.1', () => {
  console.log('✅ Connected successfully to port 80 on Russian VPS!');
  client.write('GET / HTTP/1.1\r\nHost: max.ru\r\n\r\n');
});

client.on('data', (data) => {
  console.log('Received data:', data.toString());
  client.destroy();
});

client.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
});

client.on('timeout', () => {
  console.error('❌ Connection timed out');
  client.destroy();
});
