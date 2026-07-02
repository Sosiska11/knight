import https from 'https';

const options = {
  hostname: 'cdn.node-ping-stat.ru',
  port: 443,
  path: '/knight-xhttp-debug',
  method: 'GET',
  localAddress: '192.168.0.151',
  headers: {
    'User-Agent': 'NodeJS Test Client'
  }
};

console.log('Sending request to https://cdn.node-ping-stat.ru/knight-xhttp-debug...');

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log('Headers:');
  console.log(JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:', data);
  });
});

req.on('error', (e) => {
  console.error('Request Error:', e.message);
});

req.setTimeout(5000, () => {
  console.error('Request Timeout');
  req.destroy();
});

req.end();
