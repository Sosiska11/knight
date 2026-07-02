import fs from 'fs';
import path from 'path';

const searchTerms = ['hwid', 'x-hwid', 'rvLzwA_AQPF8VR63', 'adrenalin.lol'];

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const term of searchTerms) {
      if (content.includes(term)) {
        console.log(`Found "${term}" in: ${filePath}`);
        // Log lines containing the term
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(term)) {
            console.log(`  Line ${idx + 1}: ${line.trim().substring(0, 300)}`);
          }
        });
      }
    }
  } catch (e) {
    // If binary, try raw search or ignore
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

console.log('Searching in Happ AppData folder...');
walk('C:/Users/alexs/AppData/Local/Happ');
