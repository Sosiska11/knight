import fs from 'fs';

const filePath = 'C:/Users/alexs/.gemini/antigravity-ide/brain/4a1a321a-50a5-4629-b58f-c5f938019370/.system_generated/steps/712/content.md';
const content = fs.readFileSync(filePath, 'utf-8');

console.log('File size:', content.length);

const lines = content.split('\n');
console.log('Lines count:', lines.length);

let found = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.toLowerCase().includes('nginx') || line.toLowerCase().includes('xhttp') || line.toLowerCase().includes('buffering')) {
    console.log(`Line ${i + 1}: ${line.trim().substring(0, 150)}`);
    found++;
    if (found > 50) {
      console.log('... truncated ...');
      break;
    }
  }
}
