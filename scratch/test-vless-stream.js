import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ Connected to VPS...');
  
  // Grep for test-post-cdn in access logs
  const cmd = 'grep "test-post-cdn" /var/log/nginx/access.log || echo "test-post-cdn not found in logs"';
  console.log(`Executing: ${cmd}`);
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => {
      process.stdout.write(d);
    });
    stream.on('close', () => {
      conn.end();
    });
  });
}).connect(config);
