import fs from 'fs';

function searchInBinary(filePath, term) {
  try {
    const buf = fs.readFileSync(filePath);
    const termBuf = Buffer.from(term, 'utf-8');
    let idx = buf.indexOf(termBuf);
    
    console.log(`\nSearching for "${term}" in: ${filePath}`);
    if (idx === -1) {
      console.log('  Not found');
      return;
    }
    
    while (idx !== -1) {
      console.log(`  Found at offset: ${idx} (0x${idx.toString(16)})`);
      
      // Print surrounding ASCII bytes (e.g. 50 bytes before and after)
      const start = Math.max(0, idx - 100);
      const end = Math.min(buf.length, idx + 100);
      const surrounding = buf.subarray(start, end);
      
      // Convert to clean ASCII representation
      const cleanStr = surrounding.toString('ascii').replace(/[^ -~]+/g, '.');
      console.log(`  Surrounding context: ${cleanStr}`);
      
      idx = buf.indexOf(termBuf, idx + 1);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

searchInBinary('C:/Program Files/FlyFrogLLC/Happ/Happ.exe', 'x-hwid');
searchInBinary('C:/Program Files/FlyFrogLLC/Happ/happd.exe', 'x-hwid');
searchInBinary('C:/Program Files/FlyFrogLLC/Happ/Happ.exe', 'hwid');
searchInBinary('C:/Program Files/FlyFrogLLC/Happ/happd.exe', 'hwid');
