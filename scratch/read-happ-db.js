import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT version, tag, updated_at, data FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error('Error reading subscriptions:', err.message);
    db.close();
    return;
  }
  
  console.log(`Found ${rows.length} subscriptions`);
  for (const row of rows) {
    console.log(`=== Tag: "${row.tag}" | Version: ${row.version} | Updated At: ${row.updated_at} ===`);
    if (row.data) {
      try {
        const decoded = Buffer.from(row.data).toString('utf-8');
        console.log('Decoded content:');
        console.log(decoded);
      } catch (e) {
        console.error('Failed to decode buffer:', e.message);
      }
    } else {
      console.log('Data is empty');
    }
  }
  db.close();
});
