import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
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
  'xhttp_uplink_get': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'xhttp', security: 'none',
        xhttpSettings: {
          path: '/test',
          host: 'cdn.node-ping-stat.ru',
          mode: 'packet-up',
          uplinkHTTPMethod: 'GET'
        }
      },
      sniffing: { enabled: true }
    }]
  },
  'xhttp_uplink_invalid': {
    // If it validates the value, this should FAIL because uplinkHTTPMethod can only be GET in packet-up mode
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'xhttp', security: 'none',
        xhttpSettings: {
          path: '/test',
          host: 'cdn.node-ping-stat.ru',
          mode: 'packet-up',
          uplinkHTTPMethod: 'INVALID_METHOD'
        }
      },
      sniffing: { enabled: true }
    }]
  }
};

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected. Probing Xray uplinkHTTPMethod validation...\n');
  for (const [name, cfg] of Object.entries(configs)) {
    const remotePath = `/tmp/xray-probe-${name}.json`;
    const writeCmd = `cat > ${remotePath} <<'KNIGHT_EOF'\n${JSON.stringify(cfg, null, 2)}\nKNIGHT_EOF`;
    await execute(conn, writeCmd);
    const testRes = await execute(conn, `${XRAY} run -test -c ${remotePath}`);
    const ok = testRes.stdout.includes('Configuration OK') || testRes.code === 0;
    console.log(`=== ${name} === ${ok ? '✅ VALID' : '❌ INVALID'}`);
    if (!ok) {
      console.log('   stderr:', testRes.stderr.trim());
    }
    await execute(conn, `rm -f ${remotePath}`);
  }
  conn.end();
}).on('error', (err) => console.error('SSH Error:', err)).connect(config);
