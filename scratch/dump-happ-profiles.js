import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT version, tag, updated_at, data FROM subscriptions", [], (err, rows) => {
  if (err) {
    fs.writeFileSync('scratch/happ-profiles.txt', 'Error: ' + err.message);
    db.close();
    return;
  }
  
  let output = '';
  for (const row of rows) {
    let decodedData = null;
    if (row.data) {
      try {
        decodedData = JSON.parse(Buffer.from(row.data).toString('utf-8'));
      } catch (e) {
        decodedData = Buffer.from(row.data).toString('utf-8');
      }
    }
    
    output += `Tag: ${row.tag} | Updated: ${row.updated_at}\n`;
    if (decodedData && decodedData.profiles) {
      output += `Profiles count: ${decodedData.profiles.length}\n`;
      decodedData.profiles.forEach((p, idx) => {
        output += `\n--- Profile ${idx + 1}: ${p.name} ---\n`;
        output += `Host: ${p.host} (${typeof p.host})\n`;
        output += `Port: ${p.port} (${typeof p.port})\n`;
        output += `Protocol: ${p.protocol} (${typeof p.protocol})\n`;
        output += `uuid: ${p.uuid} (${typeof p.uuid})\n`;
        output += `flow: ${p.flow} (${typeof p.flow})\n`;
        output += `encryption: ${p.encryption} (${typeof p.encryption})\n`;
        output += `StreamSettings: ${JSON.stringify(p.streamSettings, null, 2)}\n`;
      });
    } else {
      output += `No profiles or data not JSON: ${typeof decodedData === 'string' ? decodedData.substring(0, 1000) : JSON.stringify(decodedData)}\n`;
    }
    output += `\n==================================================\n\n`;
  }
  
  fs.writeFileSync('scratch/happ-profiles.txt', output);
  console.log('Profiles dump completed.');
  db.close();
});
