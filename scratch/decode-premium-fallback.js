import fs from 'fs';

const binPath = 'C:/Users/alexs/AppData/Local/Happ/premium-fallback.bin';
try {
  const content = fs.readFileSync(binPath, 'utf-8').trim();
  console.log('File content length:', content.length);
  console.log('File prefix:', content.substring(0, 100));

  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (base64Regex.test(content)) {
    console.log('Content is valid Base64!');
    const decoded = Buffer.from(content, 'base64');
    console.log('Decoded length:', decoded.length);
    console.log('Decoded hex prefix:', decoded.subarray(0, 100).toString('hex'));
    console.log('Decoded UTF-8 prefix (first 200 chars):', decoded.subarray(0, 200).toString('utf-8'));
    
    // Check for readable strings in decoded buffer
    const targets = ['vless', 'vmess', 'trojan', 'adrenalin', 'knight'];
    const decodedStr = decoded.toString('utf-8');
    for (const t of targets) {
      if (decodedStr.toLowerCase().includes(t)) {
        console.log(`FOUND "${t}" in decoded buffer!`);
      }
    }
  } else {
    console.log('Content is NOT valid Base64');
  }
} catch (e) {
  console.error(e.message);
}
