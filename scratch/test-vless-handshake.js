import tls from 'tls';
import { URL } from 'url';

// A VLESS URL parsing helper
function parseVless(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    const uuid = url.username;
    const host = url.hostname;
    const port = parseInt(url.port, 10);
    const params = url.searchParams;
    const sni = params.get('sni');
    const pbk = params.get('pbk');
    const sid = params.get('sid');
    const security = params.get('security');
    const flow = params.get('flow');
    const remark = decodeURIComponent(url.hash.substring(1));
    return { uuid, host, port, sni, pbk, sid, security, flow, remark };
  } catch (err) {
    console.error('Failed to parse VLESS URL:', err.message);
    return null;
  }
}

function testVlessNode(vlessUrl) {
  return new Promise((resolve) => {
    const info = parseVless(vlessUrl);
    if (!info) {
      return resolve({ success: false, reason: 'Invalid VLESS URL format' });
    }

    console.log(`\nTesting node: ${info.remark} (${info.host}:${info.port})`);
    console.log(`UUID: ${info.uuid} | SNI: ${info.sni} | PBK: ${info.pbk}`);

    const socket = tls.connect({
      host: info.host,
      port: info.port,
      servername: info.sni || undefined,
      rejectUnauthorized: false,
      timeout: 4000
    }, () => {
      console.log(' -> TLS connection established.');
      
      // Construct VLESS request
      const uuidBuf = Buffer.from(info.uuid.replace(/-/g, ''), 'hex');
      const destDomain = 'connectivity-check.ubuntu.com';
      const destPort = 80;
      const payload = 'GET /generate_204 HTTP/1.1\r\nHost: connectivity-check.ubuntu.com\r\nConnection: close\r\n\r\n';

      const headerList = [
        Buffer.from([0x00]), // version
        uuidBuf,             // UUID
        Buffer.from([0x00]), // addon length 0
        Buffer.from([0x01]), // command 1 (TCP)
        Buffer.from([0x00, 0x50]), // port 80 (0x0050)
        Buffer.from([0x02]), // domain type (domain name)
        Buffer.from([destDomain.length]), // domain length
        Buffer.from(destDomain, 'ascii'), // domain
        Buffer.from(payload, 'ascii') // payload
      ];

      const reqBuffer = Buffer.concat(headerList);
      socket.write(reqBuffer);
    });

    let completed = false;
    let dataBuffer = Buffer.alloc(0);

    socket.on('data', (data) => {
      dataBuffer = Buffer.concat([dataBuffer, data]);
      // If we receive data, let's see if it looks like VLESS response (starts with 0x00)
      if (dataBuffer.length >= 2) {
        const version = dataBuffer[0];
        const addonLen = dataBuffer[1];
        const headerLen = 2 + addonLen;
        if (dataBuffer.length > headerLen) {
          const responsePayload = dataBuffer.slice(headerLen).toString('utf-8');
          console.log(` -> Received response (VLESS version: ${version}, addonLen: ${addonLen}):`);
          console.log(responsePayload.substring(0, 300));
          if (responsePayload.includes('HTTP/1.1 204') || responsePayload.includes('HTTP/1.0 204') || responsePayload.includes('204 No Content') || responsePayload.includes('HTTP/')) {
            completed = true;
            resolve({ success: true, payload: responsePayload });
            socket.destroy();
          }
        }
      }
    });

    socket.on('error', (err) => {
      if (!completed) {
        completed = true;
        resolve({ success: false, reason: `Socket error: ${err.message}` });
      }
    });

    socket.on('timeout', () => {
      if (!completed) {
        completed = true;
        resolve({ success: false, reason: 'Connection timed out' });
        socket.destroy();
      }
    });

    socket.on('end', () => {
      if (!completed) {
        completed = true;
        resolve({ success: false, reason: 'Connection closed by remote server', data: dataBuffer.toString('hex') });
      }
    });
  });
}

// Test with the parsed reserves we saw earlier
const testUrls = [
  // Germany 1
  'vless://e65c9135-5c62-4e63-9bec-bca0cdf94f52@167.172.108.83:443?encryption=none&flow=xtls-rprx-vision&fp=firefox&pbk=YIwwnfgqZKzbdxD0Mq-PiOmIDPYCvkaptHyN_HzDgFA&security=reality&sid=844282e475538c&sni=icloud.com&spx=%2FwkBfIEIhNxYDFMj&type=tcp#🇩🇪 Германия | Резерв 1',
  // Germany 2
  'vless://181bc4ca-c88b-459e-979c-d6a77fa7a05a@167.172.108.83:443?encryption=none&flow=xtls-rprx-vision&fp=chrome&pbk=YIwwnfgqZKzbdxD0Mq-PiOmIDPYCvkaptHyN_HzDgFA&security=reality&sid=c3d77ad7c9&sni=icloud.com&spx=/HPikIP6gewFWkRW&type=tcp#🇩🇪 Германия | Резерв 2',
  // Netherlands 1
  'vless://b54d36d1-43c3-4b8f-a5f8-cf6504db0562@144.31.233.236:9443?type=tcp&security=reality&flow=xtls-rprx-vision&fp=firefox&pbk=MbYR2O0XBSeG74gGYpFIofXsILcf5lG2gc36GyURBXQ&sid=0199436dd359351b&sni=apple.com#🇳🇱 Нидерланды | Резерв 1'
];

async function runTests() {
  for (const url of testUrls) {
    const res = await testVlessNode(url);
    console.log(`Result: ${res.success ? '🟢 SUCCESS' : '🔴 FAILED'} | Reason: ${res.reason || 'N/A'}`);
    if (res.data) console.log(`Data received: ${res.data.substring(0, 100)}`);
  }
}

runTests();
