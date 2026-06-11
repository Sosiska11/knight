import axios from 'axios';

async function testOldLogic() {
  const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/1.txt`;
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const text = response.data;
    if (!text || typeof text !== 'string') return;

    const lines = text.split('\n');
    const newReserve = [];

    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith('vless://')) continue;

      let country = null;
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes('германия') || lowerLine.includes('germany') || lowerLine.includes('de') || lowerLine.includes('🇩🇪')) {
        country = 'DE';
      }
      else if (lowerLine.includes('нидерланды') || lowerLine.includes('netherlands') || lowerLine.includes('nl') || lowerLine.includes('🇳🇱')) {
        country = 'NL';
      }

      if (country) {
        newReserve.push({ country, url: line });
      }
    }

    const deNodes = newReserve.filter(n => n.country === 'DE').slice(0, 3);
    const nlNodes = newReserve.filter(n => n.country === 'NL').slice(0, 3);
    
    console.log("OLD LOGIC DE NODES SELECTED:");
    deNodes.forEach(n => console.log(" -", n.url.substring(0, 120)));
    
    console.log("OLD LOGIC NL NODES SELECTED:");
    nlNodes.forEach(n => console.log(" -", n.url.substring(0, 120)));

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

testOldLogic();
