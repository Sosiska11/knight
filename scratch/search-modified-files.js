import fs from 'fs';
import path from 'path';

const keywords = ['vless://', 'vmess://', 'trojan://', 'outbounds', 'adrenalin.lol'];
const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

function checkFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.mtimeMs < twoHoursAgo) return;
    if (stats.size > 2000000) return; // skip large files
    
    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.json', '.txt', '.conf', '.yaml', '.yml', '.bin', '.dat', ''].includes(ext)) return;

    const content = fs.readFileSync(filePath);
    
    // Check for keywords in buffer
    for (const kw of keywords) {
      if (content.includes(kw)) {
        console.log(`MATCH FOUND: ${filePath}`);
        console.log(`  Modified: ${stats.mtime}`);
        console.log(`  Size: ${stats.size} bytes`);
        console.log(`  Preview:`, content.subarray(0, 500).toString('utf-8'));
      }
    }
  } catch (e) {}
}

function scanDir(dir, depth = 0) {
  if (depth > 5) return;
  try {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // Skip temp/cache directories of browsers, etc.
          if (['temp', 'cache', 'npm', 'yarn', 'git', 'chrome', 'edge', 'discord', 'slack', 'microsoft'].some(s => item.toLowerCase().includes(s))) {
            continue;
          }
          scanDir(fullPath, depth + 1);
        } else {
          checkFile(fullPath);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

console.log('Scanning AppData/Local for recently modified configuration files...');
scanDir('C:/Users/alexs/AppData/Local');
console.log('Scan completed.');
