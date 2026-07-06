import * as db from '../src/database.js';

async function testCache() {
  console.log('🔄 Initializing database...');
  await db.initDb();

  const testIp = '1.1.1.1';
  const testCountry = 'AU';
  const testOrg = 'Cloudflare, Inc.';

  console.log(`\n🔍 Checking cache for IP ${testIp} (expecting null or old data)...`);
  const initial = await db.getGeoCache(testIp);
  console.log('Result:', initial);

  console.log(`\n💾 Inserting test data for IP ${testIp}...`);
  await db.setGeoCache(testIp, testCountry, testOrg);
  console.log('Test data inserted successfully.');

  console.log(`\n🔍 Checking cache for IP ${testIp} again (expecting inserted data)...`);
  const afterInsert = await db.getGeoCache(testIp);
  console.log('Result:', afterInsert);

  if (afterInsert && afterInsert.ip === testIp && afterInsert.country === testCountry && afterInsert.org === testOrg) {
    console.log('\n🟢 SUCCESS: SQLite GeoIP Cache read/write works correctly!');
  } else {
    console.log('\n🔴 FAILURE: Cache data mismatch.');
  }
}

testCache().catch(err => {
  console.error('❌ Test failed with error:', err);
});
