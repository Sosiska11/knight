import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT sql, name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  let output = 'Database Schema:\n\n';
  for (const table of tables) {
    output += `Table: ${table.name}\n`;
    output += `SQL: ${table.sql}\n`;
    output += `--------------------------------------------------\n`;
  }
  
  fs.writeFileSync('scratch/happ-schema-output.txt', output);
  console.log('Schema dump completed.');
  db.close();
});
