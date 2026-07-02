import axios from 'axios';

async function testHwids() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  const ua = 'Happ/1.0';

  // Base64 tags from the database
  const tags = [
    '95opvjz6WUftVLcqamj6jA==',
    'ZNkarojC72hB/uLUpAjBcA=='
  ];

  const variations = [];

  for (const tag of tags) {
    const buf = Buffer.from(tag, 'base64');
    const hex = buf.toString('hex');
    
    // Add raw base64 tag
    variations.push({ name: `${tag} (base64)`, val: tag });
    // Add raw hex
    variations.push({ name: `${tag} (hex)`, val: hex });
    // Add uppercase hex
    variations.push({ name: `${tag} (HEX)`, val: hex.toUpperCase() });
    
    // Add UUID formats: 8-4-4-4-12
    if (hex.length === 32) {
      const uuid = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
      variations.push({ name: `${tag} (UUID)`, val: uuid });
      variations.push({ name: `${tag} (UUID Upper)`, val: uuid.toUpperCase() });
    }
  }

  // Let's also try standard UUID formats or other formats if any
  for (const item of variations) {
    console.log(`\nTesting HWID format: ${item.name} -> "${item.val}"`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'x-hwid': item.val
        },
        timeout: 5000
      });
      const decodedBody = Buffer.from(response.data, 'base64').toString('utf-8');
      console.log('  Status:', response.status);
      console.log('  x-hwid-limit:', response.headers['x-hwid-limit']);
      console.log('  Body Snippet:', decodedBody.substring(0, 200));
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }
}

testHwids();
