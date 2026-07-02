import fs from 'fs';

const filePath = 'C:/Program Files/FlyFrogLLC/Happ/Happ.exe';
try {
  const buf = fs.readFileSync(filePath);
  const term = '"iss":"su.happ.proxyutility"';
  const termBuf = Buffer.from(term, 'utf-8');
  let idx = buf.indexOf(termBuf);
  
  if (idx !== -1) {
    console.log(`Found JWT issuer at offset: ${idx} (0x${idx.toString(16)})`);
    const start = Math.max(0, idx - 150);
    const end = Math.min(buf.length, idx + 150);
    const surrounding = buf.subarray(start, end);
    console.log('Surrounding ascii:');
    console.log(surrounding.toString('ascii').replace(/[^ -~]+/g, '.'));
    console.log('Surrounding hex:');
    console.log(surrounding.toString('hex'));
  } else {
    console.log('Not found');
  }
} catch (e) {
  console.error(e.message);
}
