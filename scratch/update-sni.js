import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Ошибка подключения к базе данных:', err.message);
    process.exit(1);
  }
  console.log(`📂 Подключено к БД: ${dbPath}`);
});

db.serialize(() => {
  // Выбираем старый SNI и новый
  const oldSni = 'console.cloud.yandex.ru';
  const newSni = 'dl.google.com';

  console.log(`🔄 Обновление SNI с "${oldSni}" на "${newSni}" в базе данных...`);

  db.run(
    `UPDATE subscriptions 
     SET connection_url = REPLACE(connection_url, ?, ?) 
     WHERE status = 'active'`,
    [oldSni, newSni],
    function (err) {
      if (err) {
        console.error('❌ Ошибка при обновлении:', err.message);
      } else {
        console.log(`✅ Успешно обновлено записей: ${this.changes}`);
      }
      db.close();
    }
  );
});
