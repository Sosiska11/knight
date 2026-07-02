import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.get("SELECT data FROM subscriptions LIMIT 1", [], (err, row) => {
  if (err) {
    console.error(err);
  } else if (row && row.data) {
    const buf = row.data;
    console.log('Blob length:', buf.length);
    console.log('First 16 bytes (hex):', buf.slice(0, 16).toString('hex'));
    console.log('First 16 bytes (ascii):', buf.slice(0, 16).toString('ascii'));
    // Let's write it to a scratch file to inspect
    fs.writeFileSync('scratch/happ-blob-dump.bin', buf);
    console.log('Saved to scratch/happ-blob-dump.bin');
  } else {
    console.log('No subscription data found');
  }
  db.close();
});
