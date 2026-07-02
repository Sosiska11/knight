import sqlite3 from 'sqlite3';
import fs from 'fs';
import zlib from 'zlib';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.get("SELECT data FROM subscriptions LIMIT 1", [], (err, row) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  if (row && row.data) {
    const rawStr = Buffer.from(row.data).toString('utf-8');
    console.log('Raw string length:', rawStr.length);
    console.log('Raw string prefix (100 chars):', rawStr.substring(0, 100));
    
    try {
      const decodedBuf = Buffer.from(rawStr, 'base64');
      console.log('Decoded buffer length:', decodedBuf.length);
      console.log('Decoded buffer hex prefix:', decodedBuf.subarray(0, 30).toString('hex'));
      
      // Check if it's gzip/deflate
      try {
        const unzipped = zlib.unzipSync(decodedBuf);
        console.log('✅ Successfully unzipped! Length:', unzipped.length);
        console.log('Unzipped text prefix:', unzipped.toString('utf-8').substring(0, 500));
        fs.writeFileSync('scratch/decoded-happ-unzipped.txt', unzipped.toString('utf-8'));
      } catch (zipErr) {
        console.log('Not compressed with gzip/deflate (or invalid data):', zipErr.message);
        
        // Try decoding as plaintext utf-8
        const decodedText = decodedBuf.toString('utf-8');
        console.log('Decoded text prefix:', decodedText.substring(0, 500));
        fs.writeFileSync('scratch/decoded-happ-text.txt', decodedText);
      }
    } catch (decErr) {
      console.error('Decoding failed:', decErr.message);
    }
  } else {
    console.log('No data');
  }
  db.close();
});
