import net from 'net';

const client = new net.Socket();
client.setTimeout(5000);

console.log('Connecting to 79.137.162.56:8443...');
client.connect(8443, '79.137.162.56', () => {
  console.log('✅ Connected successfully to port 8443!');
  client.destroy();
});

client.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
});

client.on('timeout', () => {
  console.error('❌ Timeout connecting to port 8443');
  client.destroy();
});
