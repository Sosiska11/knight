import xuiApi from '../src/xui-api.js';

async function test() {
  // Try to login (using the new 15000ms timeout)
  const loginSuccess = await xuiApi.login();
  console.log('Login success:', loginSuccess, 'Mock mode active:', xuiApi.mockMode);
  // Continue even if login fails because we fallback to mock mode in that case.

  try {
    const emails = ['phone', 'pc', 'vpn_user_797540993'];
    for (const email of emails) {
      console.log(`Fetching active IPs for: ${email}`);
      const ips = await xuiApi.getClientIps(email);
      console.log(`Active IPs for ${email}:`, ips, `(count: ${ips.length})`);
    }
  } catch (err) {
    console.error('Test error:', err.message);
  }
}

test();
