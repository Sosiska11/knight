import axios from 'axios';

async function searchClientsAdd() {
  const assets = [
    'InboundFormModal-C0AXyX1a.js',
    'AttachClientsModal-Du4Dp6Xf.js',
    'ClientsPage-D7laUnM2.js'
  ];

  for (const asset of assets) {
    const url = `http://141.11.197.6:2053/assets/${asset}`;
    try {
      console.log(`Checking ${asset}...`);
      const res = await axios.get(url, { timeout: 5000 });
      const content = res.data;
      
      const index = content.indexOf('/clients/add');
      if (index !== -1) {
        console.log(`FOUND in ${asset}:`);
        console.log(content.substring(index - 300, index + 300));
      }
      
      // Let's also check for "add(" or "addClient" or "addClient"
      const index2 = content.indexOf('addClient');
      if (index2 !== -1) {
        console.log(`FOUND "addClient" in ${asset}:`);
        console.log(content.substring(index2 - 100, index2 + 200));
      }
    } catch (err) {
      console.error(`Error for ${asset}:`, err.message);
    }
  }
}

searchClientsAdd();
