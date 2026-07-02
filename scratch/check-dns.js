import dns from 'dns';

const domain = 'cdn.node-ping-stat.ru';
const targetCname = '905f6c53ed0d0bf9.topology.gslb.yccdn.ru';

console.log(`Checking DNS records for ${domain}...`);

dns.resolveCname(domain, (err, addresses) => {
  if (err) {
    console.log(`❌ CNAME record lookup failed: ${err.message}`);
    console.log('Trying to resolve A records instead...');
    dns.resolve4(domain, (errA, addressesA) => {
      if (errA) {
        console.log(`❌ A record lookup failed: ${errA.message}`);
        console.log('Domain does not resolve yet. Please verify you have configured the CNAME at your registrar.');
      } else {
        console.log(`✅ Resolved A records: ${addressesA.join(', ')}`);
        console.log('Note: If this resolves to IP addresses, check if they belong to Yandex CDN.');
      }
    });
  } else {
    console.log(`✅ Found CNAME records: ${addresses.join(', ')}`);
    if (addresses.includes(targetCname)) {
      console.log('🎉 DNS is successfully configured and pointing to Yandex CDN!');
    } else {
      console.log(`⚠️ CNAME is configured, but points to: ${addresses[0]} instead of ${targetCname}`);
    }
  }
});
