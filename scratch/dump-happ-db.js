import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT version, tag, updated_at, data FROM subscriptions", [], (err, rows) => {
  if (err) {
    fs.writeFileSync('scratch/happ-db-output.txt', 'Error: ' + err.message);
    db.close();
    return;
  }
  
  let output = 'Subscriptions:\n';
  for (const row of rows) {
    let decodedData = null;
    if (row.data) {
      try {
        decodedData = JSON.parse(Buffer.from(row.data).toString('utf-8'));
      } catch (e) {
        decodedData = Buffer.from(row.data).toString('utf-8');
      }
    }
    
    output += `\n==================================================\n`;
    output += `ID: ${row.id} | Tag: ${row.tag} | Version: ${row.version} | Updated: ${row.updated_at}\n`;
    output += `==================================================\n`;
    
    if (typeof decodedData === 'object' && decodedData !== null) {
      output += JSON.stringify(decodedData, null, 2) + '\n';
    } else {
      output += 'Raw/decoded text:\n' + decodedData + '\n';
    }
  }
  
  fs.writeFileSync('scratch/happ-db-output.txt', output);
  console.log('Dump completed successfully.');
  db.close();
});
