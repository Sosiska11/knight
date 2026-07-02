import fs from 'fs';

const filePath = 'C:/Users/alexs/.gemini/antigravity-ide/brain/4a1a321a-50a5-4629-b58f-c5f938019370/.system_generated/steps/712/content.md';
const content = fs.readFileSync(filePath, 'utf-8');

const regex = /```nginx([\s\S]*?)```/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log('=== Found Nginx block ===');
  console.log(match[0]);
}

const regex2 = /grpc_pass/g;
let index = 0;
while ((match = regex2.exec(content)) !== null) {
  console.log(`=== Found grpc_pass at index ${match.index} ===`);
  const start = Math.max(0, match.index - 500);
  const end = Math.min(content.length, match.index + 1000);
  console.log(content.substring(start, end));
  index++;
  if (index >= 3) break;
}
