import { Client } from 'ssh2';

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
    // 1. Check if sslh is installed
    const whichRes = await executeCommand(conn, 'which sslh || echo "not found"');
    if (whichRes.stdout.includes('not found')) {
      console.log('sslh is not installed. Trying to install...');
      
      // Wait for any dpkg lock to release (loop up to 5 times)
      for (let attempt = 1; attempt <= 5; attempt++) {
        console.log(`\nInstallation attempt ${attempt}/5...`);
        const installRes = await executeCommand(conn, 'DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" sslh');
        
        if (installRes.code === 0) {
          console.log('✅ sslh installed successfully!');
          break;
        } else if (installRes.stderr.includes('lock') || installRes.stdout.includes('lock')) {
          console.log('Warning: dpkg lock detected. Waiting 10 seconds before retry...');
          await new Promise(r => setTimeout(r, 10000));
        } else {
          console.log('Error installing sslh:', installRes.stderr);
          break;
        }
      }
    } else {
      console.log('✅ sslh is already installed!');
    }

    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
