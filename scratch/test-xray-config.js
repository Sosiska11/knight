import fs from 'fs';
import { exec } from 'child_process';

const config = {
  "outbounds": [
    {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": "cdn.node-ping-stat.ru",
            "port": 443,
            "users": [
              {
                "id": "985e730a-42aa-441f-88a0-d9223e6da8b1",
                "encryption": "none"
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": "xhttp",
        "security": "tls",
        "tlsSettings": {
          "serverName": "cdn.node-ping-stat.ru"
        },
        "xhttpSettings": {
          "path": "/knight-down",
          "mode": "packet-up"
        }
      }
    }
  ]
};

const filePath = 'scratch/test-xr-config.json';
fs.writeFileSync(filePath, JSON.stringify(config, null, 2));

exec(`& "C:\\Program Files\\FlyFrogLLC\\Happ\\core\\xray.exe" -test -c ${filePath}`, { shell: 'powershell.exe' }, (err, stdout, stderr) => {
  console.log('Exit Code:', err ? err.code : 0);
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
});
