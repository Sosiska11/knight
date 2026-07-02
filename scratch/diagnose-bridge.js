import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function run() {
  await ssh.connect({ host: '141.11.197.6', username: 'root', password: 'IxJlIDug5LW5mF5ghOts' });

  // 1. Check adapter logs (last 20 lines)
  console.log('=== ADAPTER LOGS ===');
  const logs = await ssh.execCommand('journalctl -u bridge-adapter --no-pager -n 20');
  console.log(logs.stdout || logs.stderr);

  // 2. Check adapter config
  console.log('\n=== ADAPTER CONFIG ===');
  const cfg = await ssh.execCommand('cat /root/yac-ws-bridge/adapter/adapter.config.yaml');
  console.log(cfg.stdout);

  // 3. Check if Xray is listening on port 8080
  console.log('\n=== XRAY PORT 8080 ===');
  const xrayPort = await ssh.execCommand('ss -tlnp | grep 8080');
  console.log(xrayPort.stdout || '(nothing listening on 8080!)');

  // 4. Check Xray inbound config (ws path)
  console.log('\n=== XRAY CONFIG CHECK ===');
  const xrayConfig = await ssh.execCommand('cat /usr/local/x-ui/bin/config.json 2>/dev/null | python3 -m json.tool 2>/dev/null | head -80 || echo "config not found at standard path"');
  console.log(xrayConfig.stdout || xrayConfig.stderr);

  // 5. Check nginx config
  console.log('\n=== NGINX CONFIG ===');
  const nginx = await ssh.execCommand('cat /etc/nginx/sites-enabled/default 2>/dev/null || cat /etc/nginx/nginx.conf 2>/dev/null | head -40');
  console.log(nginx.stdout || nginx.stderr);

  // 6. Test local WS to Xray
  console.log('\n=== LOCAL WS TEST TO XRAY ===');
  const localTest = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" http://127.0.0.1:8080/knight-ws');
  console.log('HTTP status to 127.0.0.1:8080/knight-ws:', localTest.stdout);

  // 7. Check cloud function logs (via adapter wakeup endpoint)
  console.log('\n=== WAKEUP ENDPOINT TEST ===');
  const wakeup = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7319/health/78bf073d/upstream-id');
  console.log('Wakeup endpoint status:', wakeup.stdout);

  ssh.dispose();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
