import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts',
  localAddress: '192.168.0.151'
};

const XRAY = '/usr/local/x-ui/bin/xray-linux-amd64';

function execute(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = ''; let stderr = '';
      stream.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }))
        .on('data', (d) => { stdout += d.toString(); })
        .stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

const configs = {
  'splithttp_get_only': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'splithttp', security: 'none',
        splithttpSettings: {
          path: '/knight-down',
          host: 'cdn.node-ping-stat.ru',
          uploadPath: '/knight-up',
          uploadMethod: 'GET',
          downloadPath: '/knight-down',
          downloadMethod: 'GET'
        }
      },
      sniffing: { enabled: true }
    }]
  }
};

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected. Probing Xray 26.6.1 splithttpSettings support...\n');
  const results = {};
  for (const [name, cfg] of Object.entries(configs)) {
    const json = JSON.stringify(cfg).replace(/'/g, "'\\''");
    const remotePath = `/tmp/splithttp-probe-${name}.json`;
    const writeCmd = `cat > ${remotePath} <<'KNIGHT_EOF'\n${JSON.stringify(cfg, null, 2)}\nKNIGHT_EOF`;
    await execute(conn, writeCmd);
    const testRes = await execute(conn, `${XRAY} run -test -c ${remotePath}`);
    const ok = testRes.stdout.includes('Configuration OK') || testRes.code === 0;
    results[name] = { ok, stdout: testRes.stdout, stderr: testRes.stderr };
    console.log(`=== ${name} === ${ok ? '✅ VALID' : '❌ INVALID'}`);
    if (!ok) {
      console.log(`   error:`, testRes.stderr || testRes.stdout);
    }
    await execute(conn, `rm -f ${remotePath}`);
  }
  conn.end();
}).on('error', (err) => console.error('SSH Error:', err)).connect(config);
