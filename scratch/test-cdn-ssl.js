import tls from 'tls';

const host = 'cdn.node-ping-stat.ru';
const port = 443;

function checkSsl() {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: host,
      port: port,
      servername: host,
      rejectUnauthorized: false
    }, () => {
      const cert = socket.getPeerCertificate();
      console.log('🟢 SSL Handshake Successful!');
      console.log('   CN:', cert.subject?.CN);
      console.log('   Issuer:', cert.issuer?.CN);
      console.log('   Valid From:', cert.valid_from);
      console.log('   Valid To:', cert.valid_to);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log('🔴 SSL Handshake Failed:', err.message);
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(5000, () => {
      console.log('🔴 SSL Connection Timeout');
      socket.destroy();
      resolve(false);
    });
  });
}

async function run() {
  console.log(`Checking TLS connection to ${host}:${port}...`);
  await checkSsl();
}

run();
