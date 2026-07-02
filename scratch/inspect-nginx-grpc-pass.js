import fs from 'fs';

const filePath = 'C:/Users/alexs/.gemini/antigravity-ide/brain/4a1a321a-50a5-4629-b58f-c5f938019370/.system_generated/steps/712/content.md';
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
console.log('Total lines:', lines.length);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('grpc_pass') && (line.includes('server') || line.includes('location') || lines[i+1].includes('location') || lines[Math.max(0, i-1)].includes('location'))) {
    console.log(`=== Match around line ${i + 1} ===`);
    const start = Math.max(0, i - 10);
    const end = Math.min(lines.length - 1, i + 35);
    for (let j = start; j <= end; j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
}
