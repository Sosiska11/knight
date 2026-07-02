import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('C:/Users/alexs/AppData/Local/Happ/subs.db');

db.all("SELECT data FROM subscriptions", [], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    return;
  }
  for (const row of rows) {
    if (!row.data) continue;
    
    // 1. Try direct JSON parse
    let text = Buffer.from(row.data).toString('utf-8');
    let decoded = null;
    try {
      decoded = JSON.parse(text);
    } catch (e) {
      // 2. Try base64 decoding first
      try {
        const decodedBuf = Buffer.from(text, 'base64');
        decoded = JSON.parse(decodedBuf.toString('utf-8'));
      } catch (e2) {
        console.error('Failed to decode data. Raw text starts with:', text.substring(0, 50));
      }
    }

    if (decoded && decoded.profiles) {
      console.log(`Profiles found: ${decoded.profiles.length}`);
      for (const prof of decoded.profiles) {
        console.log(`- Profile: "${prof.name}" | Host: ${prof.host} | Protocol: ${prof.protocol}`);
        console.log(`  Stream:`, JSON.stringify(prof.streamSettings, null, 2));
      }
    }
  }
  db.close();
});
