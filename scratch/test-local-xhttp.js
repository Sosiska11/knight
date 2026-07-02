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
  
  console.log('--- Requesting GET /knight-down/test-session-id directly on port 8080 ---');
  conn.exec('curl -i -X GET http://127.0.0.1:8080/knight-down/test-session-id', (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d));
    stream.on('close', () => {
      console.log('\n--- Requesting GET /knight/test-session-id directly on port 8080 ---');
      conn.exec('curl -i -X GET http://127.0.0.1:8080/knight/test-session-id', (err2, stream2) => {
        if (err2) throw err2;
        stream2.on('data', (d2) => process.stdout.write(d2));
        stream2.on('close', () => {
          console.log('\n--- Requesting GET /knight-down/test-session-id via Nginx port 80 ---');
          conn.exec('curl -i -X GET http://127.0.0.1/knight-down/test-session-id', (err3, stream3) => {
            if (err3) throw err3;
            stream3.on('data', (d3) => process.stdout.write(d3));
            stream3.on('close', () => {
              conn.end();
            });
          });
        });
      });
    });
  });
}).connect(config);
