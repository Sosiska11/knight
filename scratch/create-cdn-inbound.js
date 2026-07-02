import axios from 'axios';
import xuiApi from '../src/xui-api.js';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

function getBypassUuid(mainUuid) {
  const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

const dbPath = path.resolve(projectRoot, './database.db');
const db = new sqlite3.Database(dbPath);

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function run() {
  console.log('🔑 Logging in to 3x-ui...');
  const logged = await xuiApi.login();
  if (!logged) {
    console.error('❌ Failed to log in.');
    return;
  }

  const headers = await xuiApi.getHeaders();

  console.log('Reading active subscriptions from database...');
  const activeSubs = await dbAll("SELECT client_email, client_uuid, limit_ip FROM subscriptions WHERE status = 'active'");
  console.log(`Found ${activeSubs.length} active subscriptions.`);

  const clientsList = activeSubs.map(sub => {
    const bypassUuid = getBypassUuid(sub.client_uuid);
    return {
      id: bypassUuid,
      flow: "", // ws inbound must not use flow/vision
      email: sub.client_email + '_cdn',
      limitIp: sub.limit_ip || 1,
      totalGB: 15 * 1024 * 1024 * 1024, // 15 GB limit
      expiryTime: 0,
      enable: true,
      tgId: 0,
      subId: crypto.randomUUID(),
      comment: 'Bypass CDN XHTTP profile'
    };
  });

  // Check if inbound on port 8080 already exists
  console.log('Checking existing inbounds...');
  const checkUrl = `${xuiApi.baseUrl}/panel/api/inbounds/list`;
  const inboundsRes = await axios.get(checkUrl, { headers, timeout: 5000 });
  const existingInbounds = inboundsRes.data.obj || [];
  
  const port8080Inbound = existingInbounds.find(i => i.port === 8080);
  if (port8080Inbound) {
    console.log(`⚠️ Inbound on port 8080 already exists (ID: ${port8080Inbound.id}). We will update it instead.`);
    const updatePayload = {
      remark: "System Assets Inbound",
      port: 8080,
      protocol: "vless",
      listen: "127.0.0.1",
      enable: true,
      settings: JSON.stringify({
        clients: clientsList,
        decryption: "none",
        fallbacks: []
      }),
      streamSettings: JSON.stringify({
        network: "ws",
        security: "none",
        wsSettings: {
          path: "/knight-ws",
          headers: {}
        }
      }),
      sniffing: JSON.stringify({
        enabled: true,
        destOverride: ["http", "tls"]
      })
    };
    const updateUrl = `${xuiApi.baseUrl}/panel/api/inbounds/update/${port8080Inbound.id}`;
    const res = await axios.post(updateUrl, updatePayload, { headers, timeout: 10000 });
    console.log('Inbound Update Response:', res.data);
  } else {
    console.log('Creating new VLESS-WS Inbound on port 8080...');
    const addPayload = {
      remark: "System Assets Inbound",
      port: 8080,
      protocol: "vless",
      listen: "127.0.0.1",
      enable: true,
      settings: JSON.stringify({
        clients: clientsList,
        decryption: "none",
        fallbacks: []
      }),
      streamSettings: JSON.stringify({
        network: "ws",
        security: "none",
        wsSettings: {
          path: "/knight-ws",
          headers: {}
        }
      }),
      sniffing: JSON.stringify({
        enabled: true,
        destOverride: ["http", "tls"]
      })
    };
    const addUrl = `${xuiApi.baseUrl}/panel/api/inbounds/add`;
    const res = await axios.post(addUrl, addPayload, { headers, timeout: 10000 });
    console.log('Inbound Add Response:', res.data);
  }
  
  db.close();
  console.log('✅ Inbound configuration complete!');
}

run().catch(err => {
  console.error('Error:', err.stack || err.message);
  try { db.close(); } catch(e){}
});
