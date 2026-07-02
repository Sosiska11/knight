import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT version, tag, updated_at, length(data) as len FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(rows);
    rows.forEach(r => {
      db.get("SELECT data FROM subscriptions WHERE version = ?", [r.version], (err2, row) => {
        if (row && row.data) {
          const buf = row.data;
          console.log(`Version: ${r.version} | Tag: ${r.tag} | Start of data: ${buf.slice(0, 100).toString('ascii')}`);
        }
      });
    });
  }
});
