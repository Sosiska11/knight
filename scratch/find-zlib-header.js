import sqlite3 from 'sqlite3';
import zlib from 'zlib';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT data FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  for (const row of rows) {
    if (!row.data) continue;
    const rawStr = Buffer.from(row.data).toString('utf-8').trim();
    const decoded = Buffer.from(rawStr, 'base64');
    console.log('Decoded buffer length:', decoded.length);
    
    // Try to find zlib headers (78 9c, 78 da, 78 01)
    for (let offset = 0; offset < Math.min(decoded.length, 100); offset++) {
      const b1 = decoded[offset];
      const b2 = decoded[offset + 1];
      
      // A valid zlib header must have (b1 * 256 + b2) % 31 === 0
      if ((b1 * 256 + b2) % 31 === 0 && (b1 === 0x78)) {
        console.log(`Potential zlib header found at offset ${offset}: ${b1.toString(16)} ${b2.toString(16)}`);
        try {
          const slice = decoded.subarray(offset);
          const decompressed = zlib.inflateSync(slice);
          console.log(`  SUCCESS decompressed at offset ${offset}! Length: ${decompressed.length}`);
          console.log('  Preview:', decompressed.subarray(0, 500).toString('utf-8'));
          // Stop here if successful
          db.close();
          return;
        } catch (e) {
          console.log(`  Decompress failed at offset ${offset}: ${e.message}`);
        }
      }
    }
  }
  console.log('Done scanning.');
  db.close();
});
