import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT * FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  for (const row of rows) {
    console.log(`Tag: ${row.tag}`);
    const buf = row.data;
    console.log('Buffer length:', buf.length);

    // Search for "vless://" in buffer
    const searchString = (str) => {
      const target = Buffer.from(str, 'utf-8');
      let index = buf.indexOf(target);
      const results = [];
      while (index !== -1) {
        results.push(index);
        index = buf.indexOf(target, index + 1);
      }
      return results;
    };

    const targets = ['vless://', 'vmess://', 'trojan://', 'ss://', 'adrenalin', 'knight', 'node-ping-stat', 'space'];
    for (const t of targets) {
      const idxs = searchString(t);
      console.log(`Searching for "${t}": found ${idxs.length} occurrences at positions:`, idxs);
      if (idxs.length > 0) {
        // Print surrounding context
        idxs.forEach(idx => {
          const start = Math.max(0, idx - 20);
          const end = Math.min(buf.length, idx + 200);
          console.log(`  Context at ${idx}:`, buf.subarray(start, end).toString('utf-8'));
          console.log(`  Context hex at ${idx}:`, buf.subarray(start, end).toString('hex'));
        });
      }
    }
  }
  db.close();
});
