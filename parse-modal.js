import fs from 'fs';

const file = 'C:\\Users\\alexs\\.gemini\\antigravity-ide\\brain\\3cb0bf71-b08f-40d2-9375-c292725efd5e\\.system_generated\\steps\\155\\content.md';
const content = fs.readFileSync(file, 'utf8');

console.log('File size:', content.length);
// Find any word starting with /
const words = content.split(/[\s,{}()\[\]'";`<>]+/);
const apiWords = words.filter(w => w.startsWith('/'));
console.log('API words:', [...new Set(apiWords)]);
