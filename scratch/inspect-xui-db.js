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
    console.log(`Executing remote command: ${cmd}`);
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
  console.log('✅ Connected to VPS...');
  try {
    console.log('\n--- Inspecting 3x-ui Inbounds from DB ---');
    const cmd = `python3 -c "
import sqlite3, json
conn = sqlite3.connect('/etc/x-ui/x-ui.db')
cursor = conn.cursor()
cursor.execute('SELECT id, remark, port, settings, stream_settings FROM inbounds')
rows = cursor.fetchall()
res = []
for r in rows:
    res.append({'id': r[0], 'remark': r[1], 'port': r[2], 'settings': json.loads(r[3]), 'stream_settings': json.loads(r[4])})
print(json.dumps(res, indent=2))
"`;
    await executeCommand(conn, cmd);
    conn.end();
  } catch (err) {
    console.error('Error:', err);
    conn.end();
  }
}).connect(config);
