import { NodeSSH } from 'node-ssh';

const config = {
  host: '141.11.197.6',
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts',
  localAddress: '192.168.0.151',
  readyTimeout: 60000
};

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ ...config, readyTimeout: 60000 });
  console.log('✅ Connected to VPS. Preparing client simulation...');

  const clientConfig = {
    log: { loglevel: "debug" },
    inbounds: [
      {
        port: 10808,
        listen: "127.0.0.1",
        protocol: "socks",
        settings: { auth: "noauth", udp: true }
      }
    ],
    outbounds: [
      {
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: "cdn.node-ping-stat.ru",
              port: 443,
              users: [
                {
                  id: "985e730a-42aa-441f-88a0-d9223e6da8b1", // UUID of vpn_user_797540993_cdn
                  encryption: "none"
                }
              ]
            }
          ]
        },
        streamSettings: {
          network: "xhttp",
          security: "tls",
          tlsSettings: {
            serverName: "cdn.node-ping-stat.ru"
          },
          xhttpSettings: {
            host: "cdn.node-ping-stat.ru",
            path: "/knight-down",
            mode: "packet-up",
            uplinkHTTPMethod: "GET"
          }
        }
      }
    ]
  };

  const configPath = '/root/knight-vpn-bot/scratch/test-client-config.json';
  await ssh.execCommand(`cat > ${configPath} << 'EOF'\n${JSON.stringify(clientConfig, null, 2)}\nEOF`);

  console.log('🚀 Spawning temporary xray client on port 10808...');
  // Spawn in background and redirect output to logs
  await ssh.execCommand('nohup /usr/local/x-ui/bin/xray-linux-amd64 run -c /root/knight-vpn-bot/scratch/test-client-config.json > /tmp/xray-client-test.log 2>&1 &');

  // Wait for client to start and establish handshake
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('🌐 Sending HTTP test request through proxy: socks5h://127.0.0.1:10808...');
  const curlRes = await ssh.execCommand('curl -i -s -x socks5h://127.0.0.1:10808 https://www.google.com');

  console.log('Exit code:', curlRes.code);
  console.log('--- Response Output ---');
  console.log(curlRes.stdout || curlRes.stderr || '(No output)');
  console.log('-----------------------');

  // Terminate client and read logs
  const logsRes = await ssh.execCommand('cat /tmp/xray-client-test.log');
  console.log('--- Xray Client Logs ---');
  console.log(logsRes.stdout || '(No client logs)');
  console.log('------------------------');

  const xrayServerLogs = await ssh.execCommand('journalctl -u x-ui -n 30 --no-pager');
  console.log('--- Xray Server Logs ---');
  console.log(xrayServerLogs.stdout || '(No server logs)');
  console.log('------------------------');

  console.log('🧹 Cleaning up...');
  await ssh.execCommand('pkill -f test-client-config.json || true');
  await ssh.execCommand(`rm -f ${configPath} /tmp/xray-client-test.log`);

  const ok = curlRes.stdout.includes('204 No Content') || curlRes.stdout.includes('HTTP/1.1 204') || curlRes.code === 0 && curlRes.stdout.length > 0;
  if (ok) {
    console.log('🎉 E2E VERIFICATION SUCCESSFUL! Bypass connection works perfectly over SplitHTTP GET-ONLY!');
  } else {
    console.log('❌ E2E VERIFICATION FAILED. Check logs.');
  }

  ssh.dispose();
}

run().catch(console.error);
