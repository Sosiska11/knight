import { spawn } from 'child_process';
import fs from 'fs';

const vlessLinks = [
  // Config 1: Main NL TCP Reality
  'vless://0803d6f0-d419-4368-a8b2-b9bdb287784f@knight1.space:443?encryption=none&type=tcp&security=reality&pbk=RWc0hf-pPEhU9h91ly1Dax4oFRSdOGzmtnqMZ6arfj8&fp=chrome&sni=google.com&sid=9d&flow=xtls-rprx-vision#Main',
  // Config 2: Reserve DE gRPC Reality
  'vless://e0bb3250-1873-4b9d-b9b5-7aa6c863885f@95.85.233.181:443?encryption=none&security=reality&sni=c.primarymaster.online&pbk=S05RWQUVH-p3uqekd0iRpIeH__NpCt0XEN2xCiQJs3Y&sid=c56c3ba3b9f676c5&fp=chrome&type=grpc&mode=gun#ReserveDE',
  // Config 3: Reserve RU gRPC Reality
  'vless://c918927a-a4cf-45ad-a5c8-e135129ee1d4@37.9.4.168:443?encryption=none&security=reality&sni=centos.ubuntuhosting.host&pbk=xSBUeRP0UXGevxr3zKTskWvYG6vJSjlZYc4lYIIurmU&sid=ee&fp=firefox&type=grpc&mode=gun&headerType=none&serviceName=gun#ReserveRU'
];

// Helper to convert VLESS URL to xray outbound config
function vlessUrlToXrayOutbound(vlessUrl, tag) {
  const url = new URL(vlessUrl);
  const uuid = url.username;
  const address = url.hostname;
  const port = parseInt(url.port, 10);
  const params = url.searchParams;
  
  const security = params.get('security') || 'none';
  const flow = params.get('flow') || '';
  const sni = params.get('sni') || '';
  const pbk = params.get('pbk') || '';
  const sid = params.get('sid') || '';
  const fp = params.get('fp') || 'chrome';
  const type = params.get('type') || 'tcp';
  
  const outbound = {
    "tag": tag,
    "protocol": "vless",
    "settings": {
      "vnext": [
        {
          "address": address,
          "port": port,
          "users": [
            {
              "id": uuid,
              "encryption": "none",
              "flow": flow || undefined
            }
          ]
        }
      ]
    },
    "streamSettings": {
      "network": type,
      "security": security
    }
  };
  
  if (security === 'tls') {
    outbound.streamSettings.tlsSettings = {
      "serverName": sni || undefined,
      "fingerprint": fp || undefined
    };
  } else if (security === 'reality') {
    outbound.streamSettings.realitySettings = {
      "show": false,
      "fingerprint": fp || 'chrome',
      "serverName": sni || undefined,
      "publicKey": pbk || undefined,
      "shortId": sid || undefined,
      "spiderX": ""
    };
  }
  
  const path = params.get('path');
  const serviceName = params.get('serviceName');
  const mode = params.get('mode');
  
  if (type === 'ws') {
    outbound.streamSettings.wsSettings = {
      "path": path || undefined
    };
  } else if (type === 'grpc') {
    outbound.streamSettings.grpcSettings = {
      "serviceName": serviceName || undefined,
      "multiMode": mode === 'multi'
    };
  }
  
  return outbound;
}

// Helper to convert VLESS URL to sing-box outbound config
function vlessUrlToSingboxOutbound(vlessUrl, tag) {
  const url = new URL(vlessUrl);
  const uuid = url.username;
  const address = url.hostname;
  const port = parseInt(url.port, 10);
  const params = url.searchParams;
  
  const security = params.get('security') || 'none';
  const flow = params.get('flow') || '';
  const sni = params.get('sni') || '';
  const pbk = params.get('pbk') || '';
  const sid = params.get('sid') || '';
  const fp = params.get('fp') || 'chrome';
  const type = params.get('type') || 'tcp';
  
  const outbound = {
    "type": "vless",
    "tag": tag,
    "server": address,
    "server_port": port,
    "uuid": uuid
  };
  
  if (flow) {
    outbound.flow = flow;
  }
  
  if (security === 'tls' || security === 'reality') {
    outbound.tls = {
      "enabled": true,
      "server_name": sni || undefined,
      "utls": {
        "enabled": true,
        "fingerprint": fp || 'chrome'
      }
    };
    
    if (security === 'reality') {
      outbound.tls.reality = {
        "enabled": true,
        "public_key": pbk,
        "short_id": sid || ""
      };
    }
  }
  
  const path = params.get('path');
  const serviceName = params.get('serviceName') || params.get('serviceName') || '';
  
  if (type === 'ws' || type === 'grpc') {
    outbound.transport = {
      "type": type
    };
    if (type === 'ws') {
      outbound.transport.path = path || undefined;
    } else if (type === 'grpc') {
      outbound.transport.service_name = serviceName || undefined;
    }
  }
  
  return outbound;
}

async function testXray(outbound) {
  const config = {
    "log": { "loglevel": "debug" },
    "inbounds": [{
      "port": 20001,
      "listen": "127.0.0.1",
      "protocol": "socks",
      "settings": { "udp": true }
    }],
    "outbounds": [outbound, { "protocol": "freedom", "tag": "direct" }]
  };
  
  fs.writeFileSync('scratch/temp-xray-config.json', JSON.stringify(config, null, 2));
  
  return new Promise((resolve) => {
    const xray = spawn('C:/Program Files/FlyFrogLLC/Happ/core/xray.exe', ['run', '-c', 'scratch/temp-xray-config.json']);
    let output = '';
    
    const timer = setTimeout(() => {
      xray.kill();
      resolve({ success: true, log: output });
    }, 2000);
    
    xray.stdout.on('data', (data) => { output += data.toString(); });
    xray.stderr.on('data', (data) => { output += data.toString(); });
    
    xray.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || output.includes('started')) {
        resolve({ success: true, log: output });
      } else {
        resolve({ success: false, log: output });
      }
    });
  });
}

async function testSingbox(outbound) {
  const config = {
    "log": { "level": "debug" },
    "inbounds": [{
      "type": "socks",
      "tag": "socks-in",
      "listen": "127.0.0.1",
      "listen_port": 20002
    }],
    "outbounds": [outbound, { "type": "direct", "tag": "direct" }]
  };
  
  fs.writeFileSync('scratch/temp-sb-config.json', JSON.stringify(config, null, 2));
  
  return new Promise((resolve) => {
    const sb = spawn('C:/Program Files/FlyFrogLLC/Happ/tun/sing-box.exe', ['check', '-c', 'scratch/temp-sb-config.json']);
    let output = '';
    
    sb.stdout.on('data', (data) => { output += data.toString(); });
    sb.stderr.on('data', (data) => { output += data.toString(); });
    
    sb.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, log: output });
      } else {
        resolve({ success: false, log: output });
      }
    });
  });
}

async function run() {
  console.log('--- TESTING CONFIGURATIONS ON LOCAL CORES ---');
  
  for (let i = 0; i < vlessLinks.length; i++) {
    const link = vlessLinks[i];
    console.log(`\n=============================================`);
    console.log(`Testing Config ${i + 1}: ${link.split('#')[1]}`);
    console.log(`=============================================`);
    
    // 1. Test Xray
    console.log('Testing on Xray...');
    const xrayOut = vlessUrlToXrayOutbound(link, `out-${i}`);
    const xrayResult = await testXray(xrayOut);
    console.log(`  Xray status: ${xrayResult.success ? '🟢 PASS' : '❌ FAIL'}`);
    if (!xrayResult.success) {
      console.log('  Xray Log snippet:');
      console.log(xrayResult.log.substring(0, 1000));
    }
    
    // 2. Test Sing-box
    console.log('Testing on Sing-box...');
    const sbOut = vlessUrlToSingboxOutbound(link, `out-${i}`);
    const sbResult = await testSingbox(sbOut);
    console.log(`  Sing-box status: ${sbResult.success ? '🟢 PASS' : '❌ FAIL'}`);
    if (!sbResult.success) {
      console.log('  Sing-box Log snippet:');
      console.log(sbResult.log.substring(0, 1000));
    }
  }
  
  // Cleanup temp files
  try {
    fs.unlinkSync('scratch/temp-xray-config.json');
    fs.unlinkSync('scratch/temp-sb-config.json');
  } catch (e) {}
}

run();
