import fs from 'fs';

const logPath = 'C:/Users/alexs/AppData/Local/Happ/logs/happd.log';
try {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  
  // Search for lines where sing-box is started or run
  const singboxLines = lines.filter(line => 
    line.toLowerCase().includes('sing-box') && 
    (line.toLowerCase().includes('start') || line.toLowerCase().includes('run') || line.toLowerCase().includes('cmd') || line.toLowerCase().includes('launch') || line.toLowerCase().includes('exec'))
  );
  
  console.log(`Found ${singboxLines.length} start/run lines for sing-box:`);
  singboxLines.slice(-30).forEach(line => console.log(line.trim()));
} catch (e) {
  console.error(e.message);
}
