import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

try {
  const files = walk('C:/Users/alexs/AppData/Local/Happ');
  console.log('Files found in AppData/Local/Happ:');
  files.forEach(f => console.log(' -', f));
} catch (e) {
  console.error(e.message);
}
