import { Client } from 'ssh2';

const config = {
  host: '141.11.197.6',
  port: 22,
  username: 'root',
  password: 'IxJlIDug5LW5mF5ghOts'
};

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to VPS. Querying DB via inline Node...');
  const cmd = `cd /root/knight-vpn-bot && node -e "
import('sqlite3').then(m => {
  const db = new m.default.Database('/root/knight-vpn-bot/database.db');
  db.all('SELECT count(*) as count FROM geoip_cache', (err, countRow) => {
    if (err) console.error(err);
    else console.log('Total cached IPs:', countRow[0].count);
    db.all('SELECT * FROM geoip_cache ORDER BY created_at DESC LIMIT 5', (err, rows) => {
      if (err) console.error(err);
      else console.log('Recent 5 entries:', rows);
      db.close();
    });
  });
});
"`;
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error(err);
      conn.end();
      return;
    }
    stream.on('close', () => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect(config);
