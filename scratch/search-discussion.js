import fs from 'fs';

const filePath = "C:/Users/alexs/.gemini/antigravity-ide/brain/4a1a321a-50a5-4629-b58f-c5f938019370/.system_generated/steps/541/content.md";
const content = fs.readFileSync(filePath, 'utf8');

const keywords = ['uplinkHTTPMethod', 'mode', 'packet', 'splithttp', 'xhttp', 'buffering', 'GET', 'POST', 'timeout'];

keywords.forEach(kw => {
  console.log(`=== Matches for: ${kw} ===`);
  let count = 0;
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      count++;
      if (count <= 25) {
        // Strip HTML tags for clean printing
        const cleanLine = line.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanLine.length > 5) {
          console.log(`[Line ${idx + 1}] ${cleanLine.substring(0, 160)}`);
        }
      }
    }
  });
  console.log(`Total matches for ${kw}: ${count}\n`);
});
