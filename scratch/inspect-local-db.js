import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.db');

db.all("SELECT * FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error('Error reading subscriptions:', err.message);
    return;
  }
  console.log('Subscriptions in local database:');
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
