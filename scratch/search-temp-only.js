import fs from 'fs';
import path from 'path';
import os from 'os';

const tempDir = os.tmpdir();
console.log('Scanning Temp Dir:', tempDir);

const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

try {
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    const filePath = path.join(tempDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) continue;
      
      // Look for files modified in the last 2 hours
      if (stats.mtimeMs >= twoHoursAgo && stats.size > 50 && stats.size < 100000) {
        console.log(`File: ${file} | Size: ${stats.size} | Modified: ${stats.mtime}`);
        // Read first 200 bytes as hex and text
        const buf = fs.readFileSync(filePath);
        console.log('  Text Preview:', buf.subarray(0, 200).toString('utf-8').replace(/[^ -~]+/g, '.'));
        console.log('  Hex Preview: ', buf.subarray(0, 50).toString('hex'));
      }
    } catch (e) {}
  }
} catch (e) {
  console.error(e.message);
}
