import dns from 'dns';

dns.promises.lookup('knight1.space').then(res => {
  console.log('knight1.space IP:', res.address);
}).catch(err => {
  console.error('DNS Lookup Error:', err.message);
});
