import fs from 'fs';
import path from 'path';
import os from 'os';

const tempDir = os.tmpdir();
console.log('Searching in temp directory:', tempDir);

function searchInFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 500000) return; // Ignore very large files
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('vless') || content.includes('outbounds') || content.includes('adrenalin')) {
      console.log(`Found match in: ${filePath} (Size: ${stats.size} bytes)`);
      if (filePath.endsWith('.json')) {
        console.log('JSON Snippet:', content.substring(0, 500));
      }
    }
  } catch (e) {}
}

function walk(dir) {
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          // Don't recurse too deep
        } else {
          searchInFile(fullPath);
        }
      } catch (e) {}
    });
  } catch (e) {
    console.error(e.message);
  }
}

walk(tempDir);
walk('C:/Users/alexs/AppData/Local/Temp');
