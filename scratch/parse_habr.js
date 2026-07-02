import fs from 'fs';
import path from 'path';

const filePath = 'C:\\Users\\alexs\\.gemini\\antigravity-ide\\brain\\4f7f724a-e61f-453b-99ce-55d787073687\\.system_generated\\steps\\6\\content.md';
const content = fs.readFileSync(filePath, 'utf8');

// Find window.__PINIA_STATE__
const piniaStart = content.indexOf('window.__PINIA_STATE__=');
if (piniaStart !== -1) {
  const startIdx = piniaStart + 'window.__PINIA_STATE__='.length;
  // Let's find the matching braces
  let braceCount = 0;
  let endIdx = -1;
  let inString = false;
  let escape = false;
  
  for (let i = startIdx; i < content.length; i++) {
    const char = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"' || char === "'") {
      if (!inString) {
        inString = char;
      } else if (inString === char) {
        inString = false;
      }
    }
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
  }
  
  if (endIdx !== -1) {
    const jsonStr = content.substring(startIdx, endIdx);
    try {
      const data = JSON.parse(jsonStr);
      console.log("Successfully parsed Pinia State!");
      console.log("State top-level keys:", Object.keys(data));
      
      // Let's recursively search for any field named 'comments' or similar
      function searchObj(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          // If it is an array and items look like comments
          if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && obj[0].message) {
            console.log(`Found comments array at: ${path} (length: ${obj.length})`);
            printCommentsList(obj);
          }
          obj.forEach((item, idx) => searchObj(item, `${path}[${idx}]`));
          return;
        }
        
        for (const [key, val] of Object.entries(obj)) {
          if (key === 'comments' && val && typeof val === 'object') {
            const keysVal = Object.keys(val);
            console.log(`Found key 'comments' under path: ${path}. Keys:`, keysVal.slice(0, 10));
            // Let's see if this contains a list or map of comments
            const commentsList = Object.values(val).filter(c => c && typeof c === 'object' && (c.message || c.text || c.body));
            if (commentsList.length > 0) {
              console.log(`Found comments list under 'comments' at: ${path} (length: ${commentsList.length})`);
              printCommentsList(commentsList);
            }
          }
          
          if (val && typeof val === 'object') {
            searchObj(val, path ? `${path}.${key}` : key);
          }
        }
      }
      
      function printCommentsList(commentsList) {
        // Sort comments by ID descending or time published
        commentsList.sort((a, b) => {
          const idA = a.id || 0;
          const idB = b.id || 0;
          return idB - idA;
        });
        
        console.log("\n--- COMMENTS ---");
        commentsList.slice(0, 30).forEach((c, idx) => {
          const user = c.author?.alias || c.authorName || 'Unknown';
          const time = c.timePublished || c.timeCreated || 'N/A';
          const text = c.message || c.text || '';
          const cleanText = text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          console.log(`[${idx + 1}] ID: ${c.id} | User: ${user} | Time: ${time}`);
          console.log(`Text: ${cleanText.trim()}`);
          console.log("-".repeat(50));
        });
      }
      
      searchObj(data);
      
    } catch (err) {
      console.error("Failed to parse JSON:", err);
    }
  }
}
