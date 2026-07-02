import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT version, tag, updated_at, data FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error('Error reading subscriptions:', err.message);
    db.close();
    return;
  }
  
  let output = `Found ${rows.length} subscriptions in Happ DB:\n\n`;
  
  rows.forEach((row, index) => {
    output += `=== Subscription #${index + 1} ===\n`;
    output += `Tag (Base64): ${row.tag}\n`;
    output += `Version: ${row.version}\n`;
    output += `Updated At: ${row.updated_at}\n`;
    
    if (row.data) {
      try {
        const rawStr = Buffer.from(row.data).toString('utf-8');
        output += `Raw string length: ${rawStr.length}\n`;
        
        // Try decoding as base64
        const decodedBuf = Buffer.from(rawStr, 'base64');
        const decodedText = decodedBuf.toString('utf-8');
        
        // Write the first 2000 chars of decoded text
        output += `Decoded text snippet (first 2000 chars):\n${decodedText.substring(0, 2000)}\n`;
        
        // Search for any VLESS links in the decoded text
        const vlessUrls = [];
        const vlessMatches = decodedText.match(/vless:\/\/[^\s"']+/g);
        if (vlessMatches) {
          vlessUrls.push(...vlessMatches);
        }
        
        output += `\nFound ${vlessUrls.length} VLESS links inside data:\n`;
        vlessUrls.forEach(link => {
          output += `${link}\n`;
        });
        
      } catch (e) {
        output += `Failed to parse data: ${e.message}\n`;
      }
    } else {
      output += `No data buffer\n`;
    }
    output += `\n--------------------------------------------------\n\n`;
  });
  
  fs.writeFileSync('scratch/happ-sub-links.txt', output);
  console.log('Successfully written to scratch/happ-sub-links.txt');
  db.close();
});
