import fs from 'fs';

const logPath = 'C:/Users/alexs/AppData/Local/Happ/logs/happd.log';
try {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  console.log(`Total log lines: ${lines.length}`);
  
  // Filter lines containing "2026-07-02"
  const todayLines = lines.filter(line => line.includes('2026-07-02'));
  console.log(`Found ${todayLines.length} log lines for today (2026-07-02):`);
  
  // Print first 50 and last 100 lines of today
  if (todayLines.length > 150) {
    console.log('--- First 50 lines ---');
    console.log(todayLines.slice(0, 50).join('\n'));
    console.log('\n... [truncated] ...\n');
    console.log('--- Last 100 lines ---');
    console.log(todayLines.slice(-100).join('\n'));
  } else {
    console.log(todayLines.join('\n'));
  }
} catch (e) {
  console.error('Error reading log:', e.message);
}
