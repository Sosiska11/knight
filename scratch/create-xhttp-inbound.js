// ============================================================================
// create-xhttp-inbound.js
// Переводит инбаунд 4 (System Assets Inbound) с WebSocket на XHTTP transport.
//
// Цепочка обхода: Телефон (VLESS-XHTTP packet-up) → Yandex CDN
//   (cdn.node-ping-stat.ru) → nginx :80 → Xray inbound 4 (XHTTP, :8080)
//
// v2: берёт клиентов из бэкапа инбаунда (scratch/inbound-4-backup.json),
//     а не из локальной БД (которая может отличаться от боевой).
// ============================================================================

import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Параметры XHTTP (боевые значения для обхода через Yandex CDN)
const XHTTP_PATH = '/knight-down';
const XHTTP_HOST = 'cdn.node-ping-stat.ru';   // боевой CDN-домен (white-listed IP)
const XHTTP_PORT = 8080;                       // локальный порт Xray (listen 127.0.0.1)
const TARGET_INBOUND_ID = 4;

const BACKUP_FILE = path.join(__dirname, 'inbound-4-backup.json');

(async () => {
  console.log('🔑 Logging in to 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) { console.error('❌ Failed to log in.'); process.exit(1); }
  const headers = await xuiApi.getHeaders();

  // 1. Читаем клиентов из бэкапа инбаунда (источник истины = панель)
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`❌ Backup file not found: ${BACKUP_FILE}`);
    console.error('   Сначала запусти: node scratch/dump-inbound.js 4');
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  const clientsList = (backup.settings && backup.settings.clients) || [];
  console.log(`\n📋 Loaded ${clientsList.length} clients from backup (inbound-4-backup.json):`);
  clientsList.forEach(c => console.log(`   - ${c.email} (uuid=${c.id.substring(0,8)}..., limit=${c.limitIp}, totalGB=${Math.round(c.totalGB/1073741824)}GB)`));

  // 2. streamSettings для XHTTP (Xray 26.6.1)
  // mode=packet-up — максимальная совместимость с CDN (рекомендация RPRX #4113)
  // extra: upload-параметры. scMaxEachPostBytes ≤ 1MB чтобы CDN не резал upload.
  const xhttpStreamSettings = {
    network: 'xhttp',
    security: 'none',
    xhttpSettings: {
      path: XHTTP_PATH,
      host: XHTTP_HOST,
      mode: 'packet-up',
      extra: {
        xPaddingBytes: '100-1000',
        scMaxEachPostBytes: '100000-1000000',
        scMinPostsIntervalMs: '10-30',
        scMaxBufferedPosts: 30,
        noGRPCHeader: false
      }
    }
  };

  // 3. Формируем payload, сохраняя клиентов из бэкапа 1-в-1 (UUID, лимиты, totalGB)
  const payload = {
    remark: 'System Assets Inbound',
    port: XHTTP_PORT,
    protocol: 'vless',
    listen: '127.0.0.1',
    enable: true,
    settings: JSON.stringify({
      clients: clientsList.map(c => ({
        id: c.id,
        flow: '',                 // XHTTP не использует flow
        email: c.email,
        limitIp: c.limitIp || 1,
        totalGB: c.totalGB,
        expiryTime: c.expiryTime || 0,
        enable: c.enable !== false,
        tgId: c.tgId || 0,
        subId: c.subId || crypto.randomUUID(),
        comment: 'Bypass CDN XHTTP profile'
      })),
      decryption: 'none',
      fallbacks: []
    }),
    streamSettings: JSON.stringify(xhttpStreamSettings),
    sniffing: JSON.stringify({ enabled: true, destOverride: ['http', 'tls'] })
  };

  // 4. Обновляем инбаунд
  console.log(`\n🔧 Updating inbound ${TARGET_INBOUND_ID} (port ${XHTTP_PORT}) to XHTTP...`);
  const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/${TARGET_INBOUND_ID}`;
  const res = await axios.post(updateUrl, payload, { headers, timeout: 10000 });

  if (res.data && res.data.success) {
    console.log('   ✅ Inbound updated to XHTTP successfully!');
  } else {
    console.error('   ❌ Update failed:', res.data && res.data.msg);
    process.exit(1);
  }

  // 5. Верификация
  console.log('\n🔍 Verifying final state...');
  const verifyRes = await axios.get(`${xuiApi.baseUrl}/panel/api/inbounds/get/${TARGET_INBOUND_ID}`, { headers, timeout: 5000 });
  const ib = verifyRes.data && verifyRes.data.obj;
  if (ib) {
    let ss; try { ss = JSON.parse(ib.streamSettings); } catch (e) {}
    let st; try { st = JSON.parse(ib.settings); } catch (e) {}
    console.log(`   network=${ss && ss.network} | security=${ss && ss.security}`);
    if (ss && ss.xhttpSettings) {
      console.log(`   xhttp: mode=${ss.xhttpSettings.mode} | path=${ss.xhttpSettings.path} | host=${ss.xhttpSettings.host}`);
    }
    console.log(`   clients: ${st && st.clients ? st.clients.length : 0}`);
    if (st && st.clients) {
      st.clients.forEach(c => console.log(`     - ${c.email} (uuid=${c.id.substring(0,8)}..., limit=${c.limitIp})`));
    }
  }

  console.log('\n✅ XHTTP inbound configuration complete!');
  console.log('\n📝 Далее:');
  console.log('   1. Залить scratch/nginx-xhttp.conf в /etc/nginx/sites-available/default');
  console.log('   2. nginx -t && systemctl reload nginx');
  console.log('   3. systemctl restart x-ui  (перезапустит xray с новым инбаундом)');
})().catch(err => {
  console.error('Error:', err.stack || err.message);
  process.exit(1);
});
