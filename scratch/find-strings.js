import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.get("SELECT data FROM subscriptions LIMIT 1", [], (err, row) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  
  if (row && row.data) {
    // Check both raw row.data buffer and base64-decoded buffer
    const buffers = [row.data];
    try {
      const rawStr = Buffer.from(row.data).toString('utf-8');
      buffers.push(Buffer.from(rawStr, 'base64'));
    } catch(e){}
    
    let output = '';
    
    buffers.forEach((buf, bIndex) => {
      output += `=== Buffer #${bIndex + 1} Strings ===\n`;
      let currentStr = '';
      const minLength = 6;
      
      for (let i = 0; i < buf.length; i++) {
        const char = buf[i];
        // Check if printable ASCII
        if (char >= 32 && char <= 126) {
          currentStr += String.fromCharCode(char);
        } else {
          if (currentStr.length >= minLength) {
            // Filter or keep
            output += `${currentStr}\n`;
          }
          currentStr = '';
        }
      }
      if (currentStr.length >= minLength) {
        output += `${currentStr}\n`;
      }
      output += `\n\n`;
    });
    
    fs.writeFileSync('scratch/extracted-strings.txt', output);
    console.log('Extracted strings written to scratch/extracted-strings.txt');
  } else {
    console.log('No data');
  }
  db.close();
});
