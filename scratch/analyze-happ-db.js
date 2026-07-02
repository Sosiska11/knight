import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT * FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  for (const row of rows) {
    console.log(`Tag: ${row.tag}, Updated: ${row.updated_at}, Data Type: ${typeof row.data}`);
    const buf = row.data; // should be Buffer since it is BLOB
    console.log('Buffer length:', buf.length);
    console.log('Buffer hex (first 50 bytes):', buf.subarray(0, 50).toString('hex'));
    console.log('Buffer utf-8 prefix (first 100 chars):', buf.subarray(0, 100).toString('utf-8'));
    
    // Let's check if the utf-8 string itself is base64
    const utf8Str = buf.toString('utf-8').trim();
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (base64Regex.test(utf8Str)) {
      console.log('UTF-8 string is valid Base64!');
      const decoded = Buffer.from(utf8Str, 'base64');
      console.log('Decoded Base64 length:', decoded.length);
      console.log('Decoded Base64 hex (first 50 bytes):', decoded.subarray(0, 50).toString('hex'));
      console.log('Decoded Base64 utf-8 (first 100 chars):', decoded.subarray(0, 100).toString('utf-8'));
    } else {
      console.log('UTF-8 string is NOT valid Base64');
    }
  }
  db.close();
});
