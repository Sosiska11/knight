import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
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
  console.log('✅ Connected to Netherlands VPS...');
  try {
    // Write a node script to the NL VPS that performs fast port scanning using raw TCP sockets
    const scannerScript = `
const net = require('net');

const host = '79.137.162.56';
const testPorts = [22, 80, 443, 16605, 16606, 16607, 16608, 20000, 30000];

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    
    socket.connect(port, host, () => {
      socket.destroy();
      resolve({ port, status: 'OPEN_LISTENING' });
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      resolve({ port, status: err.code }); // ECONNREFUSED, ETIMEDOUT, etc.
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, status: 'TIMEOUT' });
    });
  });
}

async function run() {
  console.log('Testing ports on ' + host + '...');
  for (const p of testPorts) {
    const res = await checkPort(p);
    console.log('Port ' + res.port + ': ' + res.status);
  }
}
run();
`;

    // Write and execute the scanner script on NL VPS
    await executeCommand(conn, `cat << 'EOF' > /tmp/test-ports-nl.js\n${scannerScript}\nEOF`);
    await executeCommand(conn, 'node /tmp/test-ports-nl.js');
    
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
