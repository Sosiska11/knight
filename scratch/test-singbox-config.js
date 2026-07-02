import fs from 'fs';
import { exec } from 'child_process';

const config = {
  "outbounds": [
    {
      "type": "vless",
      "tag": "vless-out",
      "server": "cdn.node-ping-stat.ru",
      "server_port": 443,
      "uuid": "985e730a-42aa-441f-88a0-d9223e6da8b1",
      "tls": {
        "enabled": true,
        "server_name": "cdn.node-ping-stat.ru"
      },
      "transport": {
        "type": "xhttp",
        "host": "cdn.node-ping-stat.ru",
        "path": "/knight-down",
        "mode": "packet-up"
      }
    }
  ]
};

const filePath = 'scratch/test-sb-config.json';
fs.writeFileSync(filePath, JSON.stringify(config, null, 2));

exec(`& "C:\\Program Files\\FlyFrogLLC\\Happ\\tun\\sing-box.exe" check -c ${filePath}`, { shell: 'powershell.exe' }, (err, stdout, stderr) => {
  console.log('Exit Code:', err ? err.code : 0);
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
});
