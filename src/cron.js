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

// Setup scheduler: runs every hour
export function initScheduler() {
  // '0 * * * *' = every hour at minute 0
  // For testing/development, you can use '*/5 * * * *' (every 5 minutes) or '0 * * * *'
  cron.schedule('0 * * * *', async () => {
    await checkExpiredSubscriptions();
  });
  
  console.log('📅 Subscription checker cron job scheduled (hourly).');
  
  // Run once immediately on startup to catch up on any missed expirations
  checkExpiredSubscriptions().catch(err => {
    console.error('Initial startup expiry check failed:', err);
  });
}
