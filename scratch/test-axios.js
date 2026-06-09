import axios from 'axios';
import https from 'https';

async function run() {
  const agent = new https.Agent({  
    rejectUnauthorized: false
  });

  console.log('Testing with rejectUnauthorized: false...');
  try {
    const res = await axios.get('https://knight1.space:2053/k2DkNL6lP3RhCoLRSY/', {
      httpsAgent: agent,
      timeout: 5000
    });
    console.log('Status with custom agent:', res.status);
    console.log('Headers:', res.headers);
  } catch (err) {
    console.error('Error with custom agent:', err.message, err.code);
  }

  console.log('\nTesting default axios (rejectUnauthorized: true)...');
  try {
    const res2 = await axios.get('https://knight1.space:2053/k2DkNL6lP3RhCoLRSY/', {
      timeout: 5000
    });
    console.log('Status with default agent:', res2.status);
  } catch (err) {
    console.error('Error with default agent:', err.message, err.code);
  }
}

run();
