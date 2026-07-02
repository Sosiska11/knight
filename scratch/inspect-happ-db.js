import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error('Error listing tables:', err.message);
    db.close();
    return;
  }
  
  console.log('Tables in DB:', tables.map(t => t.name));
  
  // Get schema of each table
  Promise.all(tables.map(table => {
    return new Promise((resolve) => {
      db.all(`PRAGMA table_info(${table.name})`, [], (err, info) => {
        console.log(`\nSchema for table ${table.name}:`);
        console.table(info);
        resolve();
      });
    });
  })).then(() => {
    // Print first record from subscriptions
    db.all("SELECT * FROM subscriptions LIMIT 2", [], (err, rows) => {
      if (err) {
        console.error('Error reading records:', err.message);
      } else {
        console.log('\nSample records from subscriptions (without data field for brevity):');
        rows.forEach(r => {
          const { data, ...rest } = r;
          console.log(rest);
          if (data) {
            console.log('Data length:', data.length);
            // Let's print first 30 bytes of data in hex
            console.log('Data hex prefix:', Buffer.from(data).subarray(0, 30).toString('hex'));
          }
        });
      }
      db.close();
    });
  });
});
