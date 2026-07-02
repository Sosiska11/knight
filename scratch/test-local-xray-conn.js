import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const configData = {
  "log": {
    "loglevel": "debug"
  },
  "inbounds": [
    {
      "port": 10899,
      "listen": "127.0.0.1",
      "protocol": "socks",
      "settings": {
        "auth": "noauth",
        "udp": true
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": "knight1.space",
            "port": 443,
            "users": [
              {
                "id": "0803d6f0-d419-4368-a8b2-b9bdb287784f",
                "encryption": "none",
                "flow": "xtls-rprx-vision"
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": true,
          "fingerprint": "chrome",
          "serverName": "samsung.com",
          "publicKey": "RWc0hf-pPEhU9h91ly1Dax4oFRSdOGzmtnqMZ6arfj8",
          "shortId": "9d",
          "spiderX": ""
        }
      }
    }
  ]
};

const configPath = path.resolve('scratch/xray-test-config.json');
fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
console.log('Written config to:', configPath);

console.log('Starting xray.exe...');
const xrayPath = "C:\\Program Files\\FlyFrogLLC\\Happ\\core\\xray.exe";
const xray = spawn(xrayPath, ['-config', configPath], {
  env: {
    ...process.env,
    XRAY_LOCATION_ASSET: "C:\\Program Files\\FlyFrogLLC\\Happ\\core\\"
  }
});

xray.stdout.on('data', (data) => {
  console.log(`[XRAY] ${data.toString().trim()}`);
});

xray.stderr.on('data', (data) => {
  console.error(`[XRAY ERROR] ${data.toString().trim()}`);
});

xray.on('close', (code) => {
  console.log(`xray process exited with code ${code}`);
});

// Wait 3 seconds for Xray to start, then run curl
setTimeout(() => {
  console.log('Sending request to https://httpbin.org/ip through SOCKS proxy on port 10899 using curl...');

  exec('curl -x socks5h://127.0.0.1:10899 https://httpbin.org/ip', (error, stdout, stderr) => {
    if (error) {
      console.error('Curl error:', error.message);
    }
    if (stdout) {
      console.log('Curl output:', stdout);
    }
    if (stderr) {
      console.error('Curl stderr:', stderr);
    }
    cleanup();
  });

}, 3000);

function cleanup() {
  console.log('Killing xray.exe...');
  xray.kill();
  process.exit(0);
}

