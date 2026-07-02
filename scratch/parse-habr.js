import fs from 'fs';

const contentPath = 'C:\\Users\\alexs\\.gemini\\antigravity-ide\\brain\\faedff2b-742e-45b6-876d-6346808f8d59\\.system_generated\\steps\\1024\\content.md';

function parse() {
  const content = fs.readFileSync(contentPath, 'utf8');
  
  // Find __PINIA_STATE__ text
  const match = content.match(/window\.__PINIA_STATE__=(.*?);<\/script>/);
  if (!match) {
    console.error('Could not find PINIA_STATE');
    return;
  }
  
  const stateStr = match[1];
  
  // Find occurrences of keywords in the raw state string
  console.log('--- Matches in State ---');
  const regex = /[^"]*(?:xhttp|Reality|CDN|Timeweb|whitelist|kort0881)[^"]*/gi;
  let m;
  const matches = [];
  while ((m = regex.exec(stateStr)) !== null) {
    const matchedText = m[0].trim();
    if (matchedText.length > 10 && matchedText.length < 1000) {
      matches.push(matchedText);
    }
  }
  
  // Remove duplicates and show top 30
  const uniqueMatches = [...new Set(matches)];
  console.log(`Found ${uniqueMatches.length} unique matches.`);
  uniqueMatches.slice(0, 40).forEach((match, idx) => {
    console.log(`[${idx + 1}] ${match.substring(0, 200)}`);
  });
}

parse();
