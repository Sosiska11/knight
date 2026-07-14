import { Client } from 'ssh2';
import net from 'net';

const config = {
  host: '127.0.0.1',
  port: 16605,
  username: 'root',
  password: 'aSE2VhyajWS2d'
};

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to Russian VPS...');
  try {
    console.log('Killing any listener on port 80...');
    await executeCommand(conn, 'fuser -k -n tcp 80 || true');
    await executeCommand(conn, 'ss -tulnp | grep :80 || echo "nothing listening on port 80"');
    
    // Now let's try to connect from local machine
    console.log('\nConnecting from local machine to 127.0.0.1:80 (no listener active)...');
    const client = new net.Socket();
    client.setTimeout(4000);
    client.connect(80, '127.0.0.1', () => {
      console.log('✅ Connected successfully to port 80 on Russian VPS!');
      client.write('GET / HTTP/1.1\r\nHost: max.ru\r\n\r\n');
    });

    client.on('data', (data) => {
      console.log('Received data locally:', data.toString());
      client.destroy();
      conn.end();
    });

    client.on('error', (err) => {
      console.error('❌ Connection error locally:', err.message);
      client.destroy();
      conn.end();
    });

    client.on('timeout', () => {
      console.error('❌ Connection timed out locally');
      client.destroy();
      conn.end();
    });

  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
