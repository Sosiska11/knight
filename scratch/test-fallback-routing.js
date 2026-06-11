import tls from 'tls';

function testSni(sni) {
  return new Promise((resolve) => {
    console.log(`\nTesting SNI: ${sni} on knight1.space:443...`);
    const socket = tls.connect({
      host: '141.11.197.6',
      port: 443,
      servername: sni,
      rejectUnauthorized: false,
      timeout: 5000
    }, () => {
      const cert = socket.getPeerCertificate();
      console.log(`✅ TLS Connected!`);
      console.log(`Certificate Subject:`, cert.subject ? cert.subject.CN : 'None');
      console.log(`Certificate Issuer:`, cert.issuer ? cert.issuer.CN : 'None');
      resolve(true);
      socket.destroy();
    });

    socket.on('error', (err) => {
      console.log(`❌ Connection failed:`, err.message);
      resolve(false);
    });

    socket.on('timeout', () => {
      console.log(`❌ Timeout`);
      resolve(false);
      socket.destroy();
    });
  });
}

async function run() {
  // Test SNI 'google.com' (Should go to Inbound 1 fallback -> dl.google.com)
  await testSni('google.com');

  // Test SNI 'gosuslugi.ru' (Should go to Inbound 1 fallback -> Inbound 2 -> Inbound 2 fallback -> yandex.ru)
  await testSni('gosuslugi.ru');

  // Test SNI 'sberbank.ru' (Should go to Inbound 1 fallback -> Inbound 2 -> Inbound 2 fallback -> yandex.ru)
  await testSni('sberbank.ru');
}

run();
