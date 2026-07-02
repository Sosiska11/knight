import fs from 'fs';

const filePath = 'C:/Users/alexs/AppData/Local/Happ/logs/happd.log';
if (!fs.existsSync(filePath)) {
  console.log('File does not exist');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
console.log('Total lines:', lines.length);

const lastLines = lines.slice(-150);
console.log('Last 150 lines of happd.log:');
lastLines.forEach((line, i) => {
  console.log(`${lines.length - 150 + i + 1}: ${line}`);
});
