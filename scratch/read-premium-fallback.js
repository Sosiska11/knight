import fs from 'fs';

const binPath = 'C:/Users/alexs/AppData/Local/Happ/premium-fallback.bin';
try {
  const buf = fs.readFileSync(binPath);
  console.log('Size of premium-fallback.bin:', buf.length, 'bytes');
  console.log('Hex prefix (first 100 bytes):', buf.subarray(0, 100).toString('hex'));
  
  // Try to find if there are readable ASCII strings
  const asciiStr = buf.toString('ascii');
  const cleanStr = asciiStr.replace(/[^ -~]+/g, '.');
  console.log('ASCII snippet (first 300 chars):', cleanStr.substring(0, 300));
  
  // Look for proxy protocols
  const targets = ['vless', 'vmess', 'trojan', 'adrenalin', 'knight'];
  for (const t of targets) {
    if (asciiStr.includes(t)) {
      console.log(`Found string "${t}" in premium-fallback.bin!`);
      // Find all indexes
      let idx = asciiStr.indexOf(t);
      while (idx !== -1) {
        console.log(`  Context at ${idx}:`, cleanStr.substring(Math.max(0, idx - 10), Math.min(buf.length, idx + 100)));
        idx = asciiStr.indexOf(t, idx + 1);
      }
    }
  }
} catch (e) {
  console.error('Error reading premium-fallback.bin:', e.message);
}
