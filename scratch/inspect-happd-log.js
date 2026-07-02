import fs from 'fs';

const filePath = 'C:/Users/alexs/AppData/Local/Happ/logs/happd.log';
if (!fs.existsSync(filePath)) {
  console.log('File does not exist');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
console.log('File size:', content.length);

const lines = content.split('\n');
console.log('Lines count:', lines.length);

let found = 0;
for (let i = Math.max(0, lines.length - 1000); i < lines.length; i++) {
  const line = lines[i];
  if (line.toLowerCase().includes('xhttp') || line.toLowerCase().includes('xray') || line.toLowerCase().includes('config') || line.toLowerCase().includes('fail') || line.toLowerCase().includes('error')) {
    console.log(`Line ${i + 1}: ${line.trim().substring(0, 150)}`);
    found++;
    if (found > 100) {
      console.log('... truncated ...');
      break;
    }
  }
}
