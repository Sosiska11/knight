// Read-only diagnostic: list all 3x-ui inbounds with their transport details.
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const baseUrl = (process.env.XUI_URL || '').replace(/\/+$/, '');
const username = process.env.XUI_USERNAME;
const password = process.env.XUI_PASSWORD;

function parseCookie(res) {
  const c = res.headers['set-cookie'];
  return c && c.length ? c.map(x => x.split(';')[0]).join('; ') : '';
}

(async () => {
  if (!baseUrl) { console.error('XUI_URL not set'); process.exit(1); }
  try {
    // 1. GET root for cookies + CSRF
    const g = await axios.get(`${baseUrl}/`, { timeout: 15000, validateStatus: () => true });
    let cookie = parseCookie(g);
    const csrfMatch = typeof g.data === 'string' ? g.data.match(/meta name="csrf-token" content="([^"]+)"/) : null;
    let csrf = csrfMatch ? csrfMatch[1] : '';

    const headers = { 'Content-Type': 'application/json', 'Cookie': cookie, 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' };

    // 2. Login (JSON)
    const r = await axios.post(`${baseUrl}/login`, { username, password }, { headers, timeout: 10000, validateStatus: () => true });
    cookie = parseCookie(r) || cookie;
    headers.Cookie = cookie;

    if (!(r.status === 200 && r.data && r.data.success)) {
      // try urlencoded
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);
      const r2 = await axios.post(`${baseUrl}/login`, params, { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 10000, validateStatus: () => true });
      cookie = parseCookie(r2) || cookie;
      headers.Cookie = cookie;
    }

    // 3. List inbounds
    const list = await axios.get(`${baseUrl}/panel/api/inbounds/list`, { headers, timeout: 10000 });
    const inbounds = (list.data && list.data.obj) || [];

    console.log(`Found ${inbounds.length} inbounds:\n`);
    for (const ib of inbounds) {
      let ss = ib.streamSettings;
      try { ss = typeof ss === 'string' ? JSON.parse(ss) : ss; } catch (e) {}
      let settings = ib.settings;
      try { settings = typeof settings === 'string' ? JSON.parse(settings) : settings; } catch (e) {}
      const clients = (settings && settings.clients) ? settings.clients : [];
      console.log(`=== Inbound ID=${ib.id} | remark="${ib.remark}" | protocol=${ib.protocol} | port=${ib.port} | listen=${ib.listen || '*'} | enable=${ib.enable} ===`);
      console.log(`   network=${ss && ss.network} | security=${ss && ss.security}`);
      if (ss && ss.network === 'ws' && ss.wsSettings) {
        console.log(`   wsSettings: ${JSON.stringify(ss.wsSettings)}`);
      }
      if (ss && ss.network === 'xhttp' && ss.xhttpSettings) {
        console.log(`   xhttpSettings: ${JSON.stringify(ss.xhttpSettings)}`);
      }
      console.log(`   clients (${clients.length}): ${clients.map(c => `${c.email}(${c.id ? c.id.substring(0,8) : '?'}${c.flow ? '/'+c.flow : ''})`).join(', ')}`);
      console.log('');
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
