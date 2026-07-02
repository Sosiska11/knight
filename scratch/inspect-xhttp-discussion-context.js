import fs from 'fs';

const filePath = 'C:/Users/alexs/.gemini/antigravity-ide/brain/4a1a321a-50a5-4629-b58f-c5f938019370/.system_generated/steps/712/content.md';
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');

const keywords = ['grpc_pass', 'proxy_pass', 'nginx'];
for (const kw of keywords) {
  console.log(`=== Matches for: ${kw} ===`);
  let foundCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(kw)) {
      console.log(`--- Match at line ${i + 1} ---`);
      // Print 3 lines before and after
      const start = Math.max(0, i - 4);
      const end = Math.min(lines.length - 1, i + 4);
      for (let j = start; j <= end; j++) {
        const prefix = j === i ? '=> ' : '   ';
        console.log(`${prefix}${j + 1}: ${lines[j].trim()}`);
      }
      foundCount++;
      if (foundCount >= 10) break;
    }
  }
}
