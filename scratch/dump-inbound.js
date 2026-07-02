// Read-only: dump full JSON of one inbound (default ID=4) to a local file.
// Используется как точка отката перед переделкой в XHTTP.
import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const TARGET_ID = parseInt(process.argv[2] || '4', 10);
const OUT_FILE = path.join(__dirname, `inbound-${TARGET_ID}-backup.json`);

(async () => {
  const logged = await xuiApi.login();
  if (!logged) { console.error('login failed'); process.exit(1); }
  const headers = await xuiApi.getHeaders();
  const res = await axios.get(`${xuiApi.baseUrl}/panel/api/inbounds/get/${TARGET_ID}`, { headers, timeout: 10000 });
  const obj = res.data && res.data.obj;
  if (!obj) { console.error('inbound not found'); process.exit(1); }
  fs.writeFileSync(OUT_FILE, JSON.stringify(obj, null, 2));
  console.log(`✅ Inbound ${TARGET_ID} dumped to ${OUT_FILE}`);
  console.log(`   remark=${obj.remark} | port=${obj.port}`);
  let ss; try { ss = JSON.parse(obj.streamSettings); } catch(e){}
  if (ss) console.log(`   network=${ss.network} | path=${ss.wsSettings && ss.wsSettings.path}`);
})();
