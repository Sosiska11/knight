// Read-only: probe which xhttpSettings fields Xray 26.6.1 actually accepts.
// We write several candidate inbound configs to /tmp and run `xray -test` on each.
// xray -test only VALIDATES config, does NOT start the server. Completely safe.
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

// Candidate configs to validate. Each tests a specific xhttpSettings shape.
const configs = {
  // Minimal: just path
  '01_minimal_path': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: { network: 'xhttp', security: 'none', xhttpSettings: { path: '/test' } },
      sniffing: { enabled: true, destOverride: ['http', 'tls'] }
    }]
  },
  // With mode packet-up
  '02_mode_packetup': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: { network: 'xhttp', security: 'none', xhttpSettings: { path: '/test', mode: 'packet-up' } },
      sniffing: { enabled: true }
    }]
  },
  // Full extra-style params on server
  '03_extra_fields': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'xhttp', security: 'none',
        xhttpSettings: {
          path: '/test', mode: 'packet-up', host: 'cdn.node-ping-stat.ru',
          extra: {
            xPaddingBytes: '100-1000',
            scMaxEachPostBytes: '500000-1000000',
            scMinPostsIntervalMs: '10-50',
            scMaxBufferedPosts: 30,
            noSSEHeader: false
          }
        }
      },
      sniffing: { enabled: true }
    }]
  },
  // Probe: does uploadMethod exist?
  '04_uploadMethod_probe': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'xhttp', security: 'none',
        xhttpSettings: { path: '/test', mode: 'packet-up', uploadMethod: 'GET', downloadMethod: 'GET' }
      },
      sniffing: { enabled: true }
    }]
  },
  // Probe: does xray fail on unknown fields?
  '05_fake_field': {
    inbounds: [{
      port: 18080, listen: '127.0.0.1', protocol: 'vless',
      settings: { clients: [{ id: '00000000-0000-0000-0000-000000000000' }], decryption: 'none' },
      streamSettings: {
        network: 'xhttp', security: 'none',
        xhttpSettings: { path: '/test', fooBarUnknownFieldXYZ: 'hello' }
      },
      sniffing: { enabled: true }
    }]
  }
};

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected. Probing Xray 26.6.1 xhttpSettings support...\n');
  const results = {};
  for (const [name, cfg] of Object.entries(configs)) {
    const json = JSON.stringify(cfg).replace(/'/g, "'\\''");
    const remotePath = `/tmp/xhttp-probe-${name}.json`;
    // write config via heredoc-safe printf
    const writeCmd = `cat > ${remotePath} <<'KNIGHT_EOF'\n${JSON.stringify(cfg, null, 2)}\nKNIGHT_EOF`;
    await execute(conn, writeCmd);
    const testRes = await execute(conn, `${XRAY} run -test -c ${remotePath}`);
    const ok = testRes.stdout.includes('Configuration OK') || testRes.code === 0;
    results[name] = { ok, stdout: testRes.stdout, stderr: testRes.stderr };
    console.log(`=== ${name} === ${ok ? '✅ VALID' : '❌ INVALID'}`);
    if (!ok) {
      const errLine = (testRes.stderr || testRes.stdout).split('\n').find(l => /error|unknown|invalid|field/i.test(l)) || (testRes.stderr.split('\n')[0] || '');
      console.log(`   error: ${errLine.trim().substring(0, 200)}`);
    }
    console.log('');
    await execute(conn, `rm -f ${remotePath}`);
  }
  console.log('--- SUMMARY ---');
  for (const [name, r] of Object.entries(results)) {
    console.log(`${r.ok ? '✅' : '❌'} ${name}`);
  }
  conn.end();
}).on('error', (err) => console.error('SSH Error:', err)).connect(config);
