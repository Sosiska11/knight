import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const conn = new Client();

function execute(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
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
  console.log('✅ Connected to VPS...');
  try {
    // Read config
    console.log('Reading remote configuration file...');
    const readRes = await execute(conn, 'cat /usr/local/x-ui/bin/config.json');
    let configJson = readRes.stdout;
    

    // Replace mode
    console.log('Updating mode to auto...');
    configJson = configJson.replace(/"mode":\s*"[^"]+"/g, '"mode": "auto"');
    let encoded = Buffer.from(configJson).toString('base64');
    await execute(conn, `echo "${encoded}" | base64 -d > /usr/local/x-ui/bin/config.json`);
    
    // Run test
    console.log('\n--- Running Xray Syntax Check (mode: auto) ---');
    let testRes = await execute(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -test -config /usr/local/x-ui/bin/config.json');
    console.log(`Syntax check exit code: ${testRes.code}`);
    
    if (testRes.code !== 0) {
      console.log('\nAuto mode failed. Trying to remove mode field entirely...');
      configJson = configJson.replace(/,\s*"mode":\s*"[^"]+"/g, '');
      configJson = configJson.replace(/"mode":\s*"[^"]+",?\s*/g, '');
      encoded = Buffer.from(configJson).toString('base64');
      await execute(conn, `echo "${encoded}" | base64 -d > /usr/local/x-ui/bin/config.json`);
      
      console.log('\n--- Running Xray Syntax Check (omitted mode) ---');
      testRes = await execute(conn, '/usr/local/x-ui/bin/xray-linux-amd64 -test -config /usr/local/x-ui/bin/config.json');
      console.log(`Syntax check exit code: ${testRes.code}`);
    }
    
    if (testRes.code === 0) {
      console.log('\n--- Restarting x-ui ---');
      await execute(conn, 'systemctl restart x-ui');
      console.log('x-ui restarted successfully!');
      
      console.log('\n--- Checking Listening Ports ---');
      await execute(conn, 'ss -tulpn | grep 8080 || echo "Not listening on 8080"');
    }
    
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
