import fs from 'fs';

const content = fs.readFileSync('C:/Users/alexs/.gemini/antigravity-ide/brain/ccdde21a-e58b-4909-9c88-2acab7cec4fb/.system_generated/steps/29/content.md', 'utf8');
const lines = content.split('\n');

let unmatchedCount = 0;

for (let line of lines) {
  line = line.trim();
  if (!line.startsWith('vless://') && !line.startsWith('trojan://') && !line.startsWith('ss://') && !line.startsWith('vmess://')) continue;

  const parts = line.split('#');
  if (parts.length < 2) continue;

  const remarkEncoded = parts[1];
  let remark = '';
  try {
    remark = decodeURIComponent(remarkEncoded);
  } catch (e) {
    remark = remarkEncoded;
  }

  const match = remark.match(/\b([A-Z]{2})-\d+\b/);
  if (!match) {
    unmatchedCount++;
    if (unmatchedCount <= 50) {
      console.log("Unmatched remark:", remark);
    }
  }
}
console.log("Total unmatched:", unmatchedCount);
