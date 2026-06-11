import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', 'database.db');

// Import xuiApi using ES module import
import xuiApi from '../src/xui-api.js';

const targetTgId = 797540993;
const targetEmail = `vpn_user_${targetTgId}`;

async function run() {
  console.log(`🤖 Начинаем удаление пользователя ${targetTgId} отовсюду...`);

  // 1. Подключаемся к базе данных
  const db = new sqlite3.Database(dbPath);
  
  const getSub = () => new Promise((resolve, reject) => {
    db.get('SELECT * FROM subscriptions WHERE tg_id = ?', [targetTgId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    const sub = await getSub();
    let clientUuid = targetTgId.toString(); // Значение по умолчанию, если в БД не найдено
    let clientEmail = targetEmail;

    if (sub) {
      clientUuid = sub.client_uuid || clientUuid;
      clientEmail = sub.client_email || clientEmail;
      console.log(`🔍 Найденная подписка в БД: email=${clientEmail}, uuid=${clientUuid}`);
    } else {
      console.log(`⚠️ Подписка для ID ${targetTgId} не найдена в локальной БД. Будем использовать значения по умолчанию.`);
    }

    // 2. Удаляем из 3x-ui
    console.log(`\n🔌 Подключаемся к 3x-ui для удаления клиентов...`);
    const loggedIn = await xuiApi.login();
    if (!loggedIn) {
      console.error('❌ Не удалось войти в панель 3x-ui. Проверьте настройки в .env.');
    } else {
      console.log(`🗑️ Удаляем клиента ${clientEmail} (UUID: ${clientUuid}) из 3x-ui...`);
      const deletedMain = await xuiApi.deleteClient(clientEmail, clientUuid);
      console.log(deletedMain ? '✅ Клиент успешно удален из 3x-ui' : '⚠️ Ошибка при удалении клиента (возможно, уже удален)');
    }

    // 3. Удаляем данные из локальной БД SQLite
    console.log(`\n💾 Удаляем записи из локальной базы данных...`);
    db.serialize(() => {
      db.run('DELETE FROM payments WHERE tg_id = ?', [targetTgId], function(err) {
        if (err) console.error('❌ Ошибка при удалении платежей:', err.message);
        else console.log(`✅ Удалено платежей из payments: ${this.changes}`);
      });

      db.run('DELETE FROM subscriptions WHERE tg_id = ?', [targetTgId], function(err) {
        if (err) console.error('❌ Ошибка при удалении подписок:', err.message);
        else console.log(`✅ Удалено подписок из subscriptions: ${this.changes}`);
      });

      db.run('DELETE FROM users WHERE tg_id = ?', [targetTgId], function(err) {
        if (err) console.error('❌ Ошибка при удалении пользователя:', err.message);
        else console.log(`✅ Удален пользователь из users: ${this.changes}`);
        
        db.close();
        console.log(`\n🎉 Процесс удаления пользователя ${targetTgId} успешно завершен!`);
      });
    });

  } catch (err) {
    console.error('❌ Произошла ошибка во время выполнения:', err.message);
    db.close();
  }
}

run();
