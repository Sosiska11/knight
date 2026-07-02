import fs from 'fs';
import path from 'path';

const term = 'rXytchO7ai3H';

function searchInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    if (content.indexOf(Buffer.from(term)) !== -1) {
      console.log(`Found "${term}" in: ${filePath}`);
    }
  } catch (e) {}
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

console.log('Searching...');
walk('C:/Users/alexs/AppData/Local/Happ');
