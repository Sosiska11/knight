import { initDb } from './src/database.js';
import { initScheduler } from './src/cron.js';
import { startSubServer } from './src/sub-server.js';
import bot from './src/bot.js';

async function startApp() {
  console.log('🚀 Starting Telegram VPN Bot...');

  try {
    // 1. Initialize SQLite Database
    await initDb();

    // 2. Start Cron Scheduler
    initScheduler();

    // 2.5 Start Express Subscription Server
    startSubServer();

    // 3. Set descriptions (shown before bot activation)
    try {
      await bot.telegram.setMyDescription(
        'Добро пожаловать в бот Knight VPN! 🚀\n\n' +
        'Здесь вы можете приобрести надежную, быструю и безопасную подписку на VPN для обхода любых блокировок.\n\n' +
        'Нажмите кнопку «Запустить», чтобы открыть меню и активировать бесплатный пробный доступ на 3 дня!'
      );
      
      await bot.telegram.setMyShortDescription(
        'Knight VPN — быстрый и безопасный VPN-сервис для всех ваших устройств.'
      );
      console.log('📝 Bot description and short description updated successfully.');
    } catch (err) {
      console.warn('⚠️ Could not set bot descriptions (maybe invalid token or API error):', err.message);
    }

    // 4. Launch Bot
    await bot.launch();
    console.log('🤖 Telegram Bot started successfully!');

    // Enable graceful stop
    const stopApp = (signal) => {
      console.log(`\n🛑 Received ${signal}. Stopping bot gracefully...`);
      bot.stop(signal);
      process.exit(0);
    };

    process.once('SIGINT', () => stopApp('SIGINT'));
    process.once('SIGTERM', () => stopApp('SIGTERM'));

  } catch (error) {
    console.error('❌ Critical error during startup:', error);
    process.exit(1);
  }
}

startApp();
