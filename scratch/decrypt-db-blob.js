import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import zlib from 'zlib';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT data FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  const keyBase64 = 'EWpQcNKUHdRhMrVfambG6g==';
  const keyBuf = Buffer.from(keyBase64, 'base64');
  console.log('Decryption Key length:', keyBuf.length);

  for (const row of rows) {
    if (!row.data) continue;
    const rawStr = Buffer.from(row.data).toString('utf-8').trim();
    const ciphertext = Buffer.from(rawStr, 'base64');
    console.log('Ciphertext length:', ciphertext.length);

    // Try ciphers: aes-128-cbc, aes-128-ecb, aes-256-cbc, aes-256-ecb
    const ciphers = ['aes-128-cbc', 'aes-128-ecb'];
    const ivs = [
      Buffer.alloc(16, 0), // All zeros
      keyBuf, // Same as key
      ciphertext.subarray(0, 16) // First 16 bytes of ciphertext
    ];

    for (const cipherName of ciphers) {
      for (const iv of ivs) {
        try {
          let dataToDecrypt = ciphertext;
          if (iv === ciphertext.subarray(0, 16) && cipherName.includes('cbc')) {
            dataToDecrypt = ciphertext.subarray(16);
          }

          const decipher = crypto.createDecipheriv(cipherName, keyBuf, cipherName.includes('ecb') ? null : iv);
          decipher.setAutoPadding(false); // Try without padding first in case it's custom padded or compressed
          
          let decrypted = Buffer.concat([decipher.update(dataToDecrypt), decipher.final()]);
          
          // Check if decrypted starts with zlib header or JSON/ASCII
          const checkZlib = (buf) => {
            const b1 = buf[0];
            const b2 = buf[1];
            return (b1 * 256 + b2) % 31 === 0 && (b1 === 0x78);
          };

          if (checkZlib(decrypted)) {
            console.log(`\n🎉 SUCCESS? Cipher: ${cipherName}, IV matches zlib header!`);
            try {
              const unzipped = zlib.inflateSync(decrypted);
              console.log('  Successfully decompressed decrypted buffer!');
              console.log('  Content Preview:', unzipped.subarray(0, 500).toString('utf-8'));
              db.close();
              return;
            } catch (e) {
              console.log(`  Matched zlib header but decompress failed: ${e.message}`);
            }
          }

          const asciiPreview = decrypted.subarray(0, 50).toString('utf-8').replace(/[^ -~]+/g, '.');
          if (asciiPreview.startsWith('{') || asciiPreview.startsWith('[') || asciiPreview.includes('vless')) {
            console.log(`\n🎉 SUCCESS? Cipher: ${cipherName}, plaintext preview: ${asciiPreview}`);
            db.close();
            return;
          }

        } catch (e) {
          // ignore decryption errors
        }
      }
    }
  }
  console.log('Decryption attempts complete.');
  db.close();
});
