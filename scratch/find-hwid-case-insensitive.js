import fs from 'fs';
import path from 'path';

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('hwid')) {
      console.log(`Found "hwid" in: ${filePath}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('hwid')) {
          console.log(`  Line ${idx + 1}: ${line.trim().substring(0, 300)}`);
        }
      });
    }
  } catch (e) {
    // ignore binary/errors
  }
}

function walk(dir) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      walk(fullPath);
    } else {
      searchInFile(fullPath);
    }
  });
}

console.log('Searching case-insensitively...');
walk('C:/Users/alexs/AppData/Local/Happ');
