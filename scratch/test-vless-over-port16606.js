import tls from 'tls';
import { URL } from 'url';

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
      timeout: 5000
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

// Test URL pointing to Russian Transit VPS on port 16605 (sslh)
const testUrl = 'vless://985e730a-42aa-441f-88a0-d9223e6da8b1@79.137.162.56:16605?type=tcp&security=reality&pbk=9GVK-0TGvL88TQn-A6fltF-7Y7mgS89vPu4JXaPjrh0&fp=chrome&sni=max.ru&sid=16179c10&flow=xtls-rprx-vision#Russian Transit sslh';

async function run() {
  const res = await testVlessNode(testUrl);
  console.log(`Result: ${res.success ? '🟢 SUCCESS' : '🔴 FAILED'} | Reason: ${res.reason || 'N/A'}`);
  process.exit(res.success ? 0 : 1);
}

run();
