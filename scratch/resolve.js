import dns from 'dns';

function resolveDomain(domain) {
  return new Promise((resolve) => {
    dns.resolve4(domain, (err, addresses) => {
      if (err) {
        console.log(`❌ Failed to resolve ${domain}:`, err.message);
        resolve([]);
      } else {
        console.log(`✅ ${domain} resolves to:`, addresses);
        resolve(addresses);
      }
    });
  });
}

async function run() {
  await resolveDomain('95sub.ghost-lan.com');
  await resolveDomain('max.ru');
}

run();
