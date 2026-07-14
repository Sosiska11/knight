import { execSync } from 'child_process';
import { NodeSSH } from 'node-ssh';
import config from './config.js';

const DE_DB = '/etc/x-ui/x-ui.db';

const SLAVE_NODES = [
  {
    name: 'Netherlands',
    enabled: () => process.env.SYNC_TO_NL === 'true' && !!process.env.NL_SSH_PASSWORD,
    host: () => process.env.NL_SSH_HOST || '194.50.94.46',
    user: () => process.env.NL_SSH_USER || 'root',
    pass: () => process.env.NL_SSH_PASSWORD || '',
    db: () => process.env.NL_XUI_DB || '/etc/x-ui/x-ui.db'
  },
  {
    name: 'Finland',
    enabled: () => process.env.SYNC_TO_FI === 'true' && !!process.env.FI_SSH_PASSWORD,
    host: () => process.env.FI_SSH_HOST || '31.76.46.20',
    user: () => process.env.FI_SSH_USER || 'root',
    pass: () => process.env.FI_SSH_PASSWORD || '',
    db: () => process.env.FI_XUI_DB || '/etc/x-ui/x-ui.db'
  },
  {
    name: 'Poland',
    enabled: () => process.env.SYNC_TO_PL === 'true' && !!process.env.PL_SSH_PASSWORD,
    host: () => process.env.PL_SSH_HOST || '188.255.163.236',
    user: () => process.env.PL_SSH_USER || 'root',
    pass: () => process.env.PL_SSH_PASSWORD || '',
    db: () => process.env.PL_XUI_DB || '/etc/x-ui/x-ui.db'
  }
];

let lastSyncAt = 0;
let syncInFlight = false;
const MIN_INTERVAL_MS = 5000;

function getEnabledNodes() {
  if (config.MOCK_XUI) return [];
  return SLAVE_NODES.filter(node => node.enabled());
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function runMasterSql(sql) {
  try {
    const out = execSync(`sqlite3 -json ${DE_DB} "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', timeout: 5000 });
    return JSON.parse(out || '[]');
  } catch (e) {
    console.error(`🔁 master DB read error: ${e.message.substring(0, 200)}`);
    return null;
  }
}

async function connectNode(node) {
  console.log(`    [connectNode] Initiating SSH connection to ${node.name} (${node.host()})...`);
  const ssh = new NodeSSH();
  const host = node.host();
  const user = node.user();
  const pass = node.pass();
  
  const options = {
    host,
    username: user,
    password: pass,
    readyTimeout: 15000,
    localIdent: 'SSH-2.0-OpenSSH_9.0'
  };

  try {
    await ssh.connect(options);
    console.log(`    [connectNode] Connected to ${node.name} successfully!`);
    return ssh;
  } catch (e) {
    console.error(`    [connectNode] Failed to connect to ${node.name}:`, e.message);
    throw e;
  }
}

export async function resyncNLInBackground(reason = '') {
  const enabledNodes = getEnabledNodes();
  if (enabledNodes.length === 0) {
    console.log('🔁 No slave nodes enabled for sync.');
    return;
  }

  if (syncInFlight) {
    console.log(`🔁 Slave sync already running, skip (${reason})`);
    return;
  }
  if (Date.now() - lastSyncAt < MIN_INTERVAL_MS) {
    console.log(`🔁 Slave sync throttled, skip (${reason})`);
    return;
  }
  syncInFlight = true;
  lastSyncAt = Date.now();

  try {
    console.log(`🔁 Resync to slave VPS nodes started (${reason})…`);

    // 1. Read master list of clients bound to inbound 1 or 3
    const clColsArr = 'id,email,sub_id,uuid,password,auth,flow,security,reverse,limit_ip,total_gb,expiry_time,enable,tg_id,group_name,comment,reset,created_at,updated_at,wg_private_key,wg_public_key,wg_allowed_ips,wg_pre_shared_key,wg_keep_alive'.split(',');
    const clientIdRows = runMasterSql('SELECT DISTINCT client_id AS id FROM client_inbounds WHERE inbound_id IN (1,3,5);');
    if (clientIdRows === null) {
      console.warn('🔁 abort: cant read master DB');
      return;
    }
    const clientIdset = clientIdRows.map(r => r.id);
    if (clientIdset.length === 0) {
      console.log('🔁 no clients to sync');
      return;
    }

    const clients = runMasterSql(`SELECT ${clColsArr.join(',')} FROM clients WHERE id IN (${clientIdset.join(',')});`);
    if (clients === null) {
      console.warn('🔁 abort: cant read master clients');
      return;
    }

    const links = runMasterSql('SELECT client_id, inbound_id, flow_override, created_at FROM client_inbounds WHERE inbound_id IN (1,2,3,5);');
    if (links === null) {
      console.warn('🔁 abort: cant read master client_inbounds');
      return;
    }

    console.log(`Found ${clients.length} clients and ${links.length} client_inbounds to sync.`);

    // 2. Loop and sync to each enabled node
    for (const node of enabledNodes) {
      let ssh = null;
      const dbPath = node.db();
      try {
        console.log(`  ➔ Syncing to node: ${node.name} (${node.host()})...`);
        ssh = await connectNode(node);

        // Verify node has inbounds 1, 2, 3, 5
        const checkCmd = `sqlite3 ${dbPath} "PRAGMA busy_timeout = 2000; SELECT count(*) AS n FROM inbounds WHERE id IN (1,2,3,5);"`;
        const inbCheck = await ssh.execCommand(checkCmd).then(r => parseInt((r.stdout || '0').trim(), 10));
        if (isNaN(inbCheck) || inbCheck < 4) {
          console.warn(`  🔁 Node ${node.name} has only ${inbCheck} of 4 expected inbounds — aborting sync for this node.`);
          continue;
        }

        // Stop x-ui briefly to write safely
        await ssh.execCommand('systemctl stop x-ui || true');
        
        // Backup
        const ts = Math.floor(Date.now()/60000);
        await ssh.execCommand(`test -f ${dbPath}.auto-${ts} || cp ${dbPath} ${dbPath}.auto-${ts}`);

        // Generate consolidated SQL statements
        let sqlStatements = [];
        sqlStatements.push('PRAGMA busy_timeout = 5000;');
        sqlStatements.push('BEGIN TRANSACTION;');

        // Delete existing and insert fresh clients
        for (const c of clients) {
          sqlStatements.push(`DELETE FROM clients WHERE id=${c.id};`);
          sqlStatements.push(`INSERT INTO clients (${clColsArr.join(',')}) VALUES (${clColsArr.map(k => esc(c[k])).join(',')});`);
        }

        // Rebuild client_inbounds relationships
        sqlStatements.push('DELETE FROM client_inbounds WHERE inbound_id IN (1,2,3,5);');
        for (const l of links) {
          sqlStatements.push(`INSERT INTO client_inbounds (client_id,inbound_id,flow_override,created_at) VALUES (${l.client_id},${l.inbound_id},${l.flow_override ? esc(l.flow_override) : 'NULL'},${l.created_at || 'NULL'});`);
        }

        // Delete orphans
        const masterIdList = clientIdset.join(',');
        sqlStatements.push(`DELETE FROM clients WHERE id NOT IN (${masterIdList});`);

        sqlStatements.push('COMMIT;');

        const fullSql = sqlStatements.join('\n');

        // Write SQL script to remote temp file
        const remoteSqlFile = '/tmp/knight_sync.sql';
        await ssh.execCommand(`cat << 'EOF' > ${remoteSqlFile}\n${fullSql}\nEOF`);

        // Execute SQL script in a single transaction
        const syncRes = await ssh.execCommand(`sqlite3 ${dbPath} < ${remoteSqlFile}`);
        if (syncRes.stderr) {
          console.error(`    [slave-sync] ${node.name} SQL execution warning/error:`, syncRes.stderr);
        }

        // Clean up temp file
        await ssh.execCommand(`rm -f ${remoteSqlFile}`);

        console.log(`  ✅ Node ${node.name} sync complete.`);
      } catch (nodeErr) {
        console.error(`  ❌ Node ${node.name} sync failed: ${nodeErr.message}`);
      } finally {
        if (ssh) {
          try {
            await ssh.execCommand('systemctl start x-ui');
          } catch (e) {}
          ssh.dispose();
        }
      }
    }
  } catch (err) {
    console.error(`🔁 Slave resync critical failure: ${err.message}`);
  } finally {
    syncInFlight = false;
  }
}

export function noteClientAdd(email) {
  resyncNLInBackground(`addClient ${email}`).catch(() => {});
}
export function noteClientDelete(email) {
  resyncNLInBackground(`deleteClient ${email}`).catch(() => {});
}