// Auto-sync clients to NL slave VPS (194.50.94.46)
// Triggered after success addClient/deleteClient on master.
// Full reseed: copies inbounds 1,3 settings + clients + client_inbounds from master DB to NL DB, restarts x-ui on NL.
import { NodeSSH } from 'node-ssh';
import config from './config.js';

const NL_HOST = process.env.NL_SSH_HOST || '194.50.94.46';
const NL_USER = process.env.NL_SSH_USER || 'root';
const NL_PASS = process.env.NL_SSH_PASSWORD || '';
const NL_DB = process.env.NL_XUI_DB || '/etc/x-ui/x-ui.db';
const DE_DB = '/etc/x-ui/x-ui.db';

let lastSyncAt = 0;
let syncInFlight = false;
const MIN_INTERVAL_MS = 5000; // throttle: at most one sync per 5 seconds

function isEnabled() {
  return process.env.SYNC_TO_NL === 'true' && !!NL_PASS && !config.MOCK_XUI;
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function sshExec(ssh, cmd, opts = {}) {
  const r = await ssh.execCommand(cmd, { execOptions: { pty: false }, ...opts });
  return r;
}

async function connect() {
  const ssh = new NodeSSH();
  for (let i = 0; i < 3; i++) {
    try { await ssh.connect({ host: NL_HOST, username: NL_USER, password: NL_PASS, readyTimeout: 15000 }); return ssh; }
    catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
}

async function readRowsViaMasterSSH(sshDE, sql) {
  // master is the bot's own VPS, connect directly
  const r = await sshDE.execCommand(`sqlite3 -json ${DE_DB} "${sql.replace(/"/g, '\\"')}"`);
  try { return JSON.parse(r.stdout || '[]'); } catch (e) { return []; }
}

// Connect to master directly (it is on the same host the bot runs on; use localhost)
async function getMasterRows(sql) {
  let ssh;
  try {
    const { NodeSSH } = await import('node-ssh');
    ssh = new NodeSSH();
    await ssh.connect({ host: '127.0.0.1', username: process.env.DE_SSH_USER || 'root', password: process.env.DE_SSH_PASSWORD || '', readyTimeout: 5000 });
  } catch (e) {
    // Fallback: use cp-based approach. We can't read master DB without SSH password. Skip sync.
    return null;
  }
  try {
    return await readRowsViaMasterSSH(ssh, sql);
  } finally {
    ssh.dispose();
  }
}

// Public: full re-seed triggered addClient/deleteClient
export async function resyncNLInBackground(reason = '') {
  if (!isEnabled()) return;
  if (syncInFlight) { console.log(`🔁 NL sync already running, skip (${reason})`); return; }
  if (Date.now() - lastSyncAt < MIN_INTERVAL_MS) { console.log(`🔁 NL sync throttled, skip (${reason})`); return; }
  syncInFlight = true;
  lastSyncAt = Date.now();

  try {
    console.log(`🔁 Resync to NL VPS started (${reason})…`);
    const NL = await connect();
    try {
      // Step 1: pull inbounds 1,3 + clients + client_inbounds from NL DB itself (since master and NL share same `clients` table schema)
      // We must pull from master through SSH. The bot runs ON master, so we read /etc/x-ui/x-ui.db locally.
      // But we don't have shell access locally — bot runs in Node, no sqlite3 by default. Use sqlite3 CLI on the master via local SSH.
      const NL = await connect();

      // Pull current NL rows
      const nlInbJson = await sshExec(NL, `sqlite3 -json ${NL_DB} "SELECT id,settings FROM inbounds WHERE id IN (1,3);"`).then(r => r.stdout || '[]');
      const nlInbs = JSON.parse(nlInbJson || '[]');
      if (nlInbs.length === 0) { console.log('🔁 NL has no inbound 1 or 3 — nothing to resync.'); return; }

      // Pull master rows from local DB
      const fs = await import('fs');
      // We use sqlite3 CLI on master locally. But our process is a different user (root in pm2), has access /etc/x-ui/x-ui.db.
      // Use child_process execSync sqlite3 to read master DB
      const { execSync } = await import('child_process');
      const runMasterSql = (sql) => {
        try {
          const out = execSync(`sqlite3 -json ${DE_DB} "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
          return JSON.parse(out || '[]');
        } catch (e) {
          console.error('🔁 master DB read error:', e.message.substring(0, 200));
          return [];
        }
      };

      const ibColSql = 'id,user_id,up,down,total,remark,sub_sort_index,enable,expiry_time,traffic_reset,last_traffic_reset_time,listen,port,protocol,settings,stream_settings,tag,sniffing';
      const inbounds = runMasterSql(`SELECT ${ibColSql} FROM inbounds WHERE id IN (1,3);`);
      const clientIdset = runMasterSql('SELECT DISTINCT client_id FROM client_inbounds WHERE inbound_id IN (1,3);').map(r => r.client_id);
      const clColsArr = 'id,email,sub_id,uuid,password,auth,flow,security,reverse,limit_ip,total_gb,expiry_time,enable,tg_id,group_name,comment,reset,created_at,updated_at,wg_private_key,wg_public_key,wg_allowed_ips,wg_pre_shared_key,wg_keep_alive'.split(',');
      const clients = clientIdset.length > 0 ? runMasterSql(`SELECT ${clColsArr.join(',')} FROM clients WHERE id IN (${clientIdset.join(',')});`) : [];
      const links = runMasterSql('SELECT client_id, inbound_id, flow_override, created_at FROM client_inbounds WHERE inbound_id IN (1,3);');

      // Apply on NL: stop service, wipe dups, INSERT, start
      await sshExec(NL, 'systemctl stop x-ui');
      await sshExec(NL, 'cp ' + NL_DB + ' ' + NL_DB + '.resync-backup-$(date +%s)');

      const exe = (sql) => sshExec(NL, `sqlite3 ${NL_DB} "${sql.replace(/"/g, '\\"')}"`);
      await exe('DELETE FROM client_inbounds WHERE inbound_id IN (1,3);');
      await exe('DELETE FROM inbounds WHERE id IN (1,3);');
      if (clientIdset.length > 0) {
        await exe(`DELETE FROM clients WHERE id IN (${clientIdset.join(',')});`);
      }

      // Insert inbounds (overlap with NL schema cols subset)
      const ibCols = ibColSql.split(',');
      for (const ib of inbounds) {
        const sql = `INSERT INTO inbounds (${ibCols.join(',')}) VALUES (${ibCols.map(c => esc(ib[c])).join(',')});`;
        const r = await exe(sql);
        if (r.stderr && !r.stderr.includes('UNIQUE')) console.log(`🔁 inbound ${ib.id}: ${r.stderr.substring(0,200)}`);
      }

      // Insert clients
      for (const c of clients) {
        const sql = `INSERT INTO clients (${clColsArr.join(',')}) VALUES (${clColsArr.map(k => esc(c[k])).join(',')});`;
        const r = await exe(sql);
        if (r.stderr && !r.stderr.includes('UNIQUE')) console.log(`🔁 client ${c.id}: ${r.stderr.substring(0,200)}`);
      }

      // Insert client_inbounds
      for (const l of links) {
        const sql = `INSERT INTO client_inbounds (client_id,inbound_id,flow_override,created_at) VALUES (${l.client_id},${l.inbound_id},${l.flow_override ? esc(l.flow_override) : 'NULL'},${l.created_at || 'NULL'});`;
        await exe(sql);
      }

      await sshExec(NL, 'systemctl start x-ui');
      console.log(`🔁 NL resync complete: ${inbounds.length} inbound'ов, ${clients.length} клиентов.`);
    } finally {
      NL.dispose();
    }
  } catch (err) {
    console.error(`🔁 NL resync failed: ${err.message}`);
  } finally {
    syncInFlight = false;
  }
}

export function noteClientAdd(email) {
  // fire and forget
  resyncNLInBackground(`addClient ${email}`).catch(() => {});
}

export function noteClientDelete(email) {
  resyncNLInBackground(`deleteClient ${email}`).catch(() => {});
}