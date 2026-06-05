import cron from 'node-cron';
import * as db from './database.js';
import xuiApi from './xui-api.js';
import bot from './bot.js';

// Function to check and disable expired subscriptions
export async function checkExpiredSubscriptions() {
  console.log('⏰ Running subscription expiry check...');
  try {
    const expiredList = await db.getExpiredSubscriptions();
    console.log(`🔍 Found ${expiredList.length} expired active subscriptions.`);

    for (const sub of expiredList) {
      console.log(`⏳ Processing expiry for user ${sub.tg_id} (email: ${sub.client_email})...`);
      
      // 1. Delete/Disable client in 3x-ui panel
      const deleted = await xuiApi.deleteClient(sub.client_email, sub.client_uuid);
      
      if (!deleted && !xuiApi.mockMode) {
        console.error(`❌ Failed to delete client ${sub.client_email} in 3x-ui. Skipping DB update to retry later.`);
        continue; // Don't mark as expired in DB if API call failed, so we can retry on next cron run
      }

      // 2. Mark as expired in SQLite
      await db.deactivateSubscription(sub.id);
      console.log(`✅ Subscription ${sub.id} marked as expired in DB.`);

      // 3. Notify user in Telegram
      try {
        await bot.telegram.sendMessage(
          sub.tg_id,
          `
⚠️ <b>Время действия вашей подписки Knight VPN истекло!</b>

Доступ к VPN временно приостановлен. Вы можете легко восстановить его в любой момент!
При продлении доступа ваш ключ доступа останется прежним.

💳 Перейдите в профиль или нажмите на кнопку ниже, чтобы продлить доступ:
          `,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Продлить доступ', callback_data: 'buy_menu' }],
                [{ text: '👤 Перейти в профиль', callback_data: 'profile_menu' }]
              ]
            }
          }
        );
        console.log(`✉️ Expiry notification sent to user ${sub.tg_id}.`);
      } catch (err) {
        console.warn(`⚠️ Could not send expiry notification to user ${sub.tg_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error during subscription expiry check:', error);
  }
}

// Function to send warnings 24 hours before expiration
export async function sendWarningNotifications() {
  console.log('⏰ Running subscription warning check...');
  try {
    const warningList = await db.getExpiringSubscriptions();
    console.log(`🔍 Found ${warningList.length} active subscriptions expiring in 24 hours.`);

    for (const sub of warningList) {
      console.log(`⏳ Sending warning notification to user ${sub.tg_id}...`);

      // 1. Notify user in Telegram
      try {
        await bot.telegram.sendMessage(
          sub.tg_id,
          `
⚠️ <b>Внимание! Ваша подписка Knight VPN истекает через 24 часа!</b>

Завтра доступ к VPN будет автоматически приостановлен. Чтобы пользоваться VPN без перебоев, вы можете продлить подписку прямо сейчас. При продлении ваш ключ доступа останется прежним!

💳 Нажмите на кнопку ниже, чтобы продлить доступ:
          `,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Продлить доступ', callback_data: 'buy_menu' }],
                [{ text: '👤 Перейти в профиль', callback_data: 'profile_menu' }]
              ]
            }
          }
        );
        console.log(`✉️ Warning notification sent to user ${sub.tg_id}.`);
        
        // 2. Mark warning_sent in DB
        await db.markWarningSent(sub.id);
      } catch (err) {
        console.warn(`⚠️ Could not send warning notification to user ${sub.tg_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error during warning check:', error);
  }
}

// Setup scheduler: runs every hour
export function initScheduler() {
  // '0 * * * *' = every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    await checkExpiredSubscriptions();
    await sendWarningNotifications();
  });
  
  console.log('📅 Subscription checker cron job scheduled (hourly).');
  
  // Run checks once immediately on startup to catch up
  checkExpiredSubscriptions().catch(err => {
    console.error('Initial startup expiry check failed:', err);
  });
  
  sendWarningNotifications().catch(err => {
    console.error('Initial startup warning check failed:', err);
  });
}
