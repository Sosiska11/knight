import { Client } from 'ssh2';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const REMOTE_DIR = '/root/knight-vpn-bot';
const targetTgId = 797540993;

const conn = new Client();

function executeCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Executing remote command: ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ SSH Connection to VPS established successfully!');
  
  try {
    // Run node code directly on the VPS to delete user 797540993 from database.db
    console.log(`\n--- Удаляем пользователя ${targetTgId} из базы данных на VPS ---`);
    
    // We run node script using node's -e option, importing sqlite3 dynamically using require
    const remoteNodeCmd = `cd ${REMOTE_DIR} && node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.db');
db.serialize(() => {
  db.run('DELETE FROM payments WHERE tg_id = ${targetTgId}', function(err) {
    if (err) console.error('Error payments:', err.message);
    else console.log('Deleted payments:', this.changes);
  });
  db.run('DELETE FROM subscriptions WHERE tg_id = ${targetTgId}', function(err) {
    if (err) console.error('Error subscriptions:', err.message);
    else console.log('Deleted subscriptions:', this.changes);
  });
  db.run('DELETE FROM users WHERE tg_id = ${targetTgId}', function(err) {
    if (err) console.error('Error users:', err.message);
    else console.log('Deleted user:', this.changes);
    db.close();
  });
});
"`;

    const result = await executeCommand(conn, remoteNodeCmd);
    
    console.log('\n--- Перезапускаем PM2 процесс бота ---');
    await executeCommand(conn, 'pm2 restart knight-vpn-bot');

    console.log('\n🚀 ВСЕ ОПЕРАЦИИ НА VPS ВЫПОЛНЕНЫ УСПЕШНО!');
    conn.end();
  } catch (err) {
    console.error('❌ Remote execution error:', err);
    conn.end();
  }
}).connect(config);
