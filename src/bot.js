import { Telegraf, Markup } from 'telegraf';
import crypto from 'crypto';
import config from './config.js';
import * as db from './database.js';
import xuiApi from './xui-api.js';
import { PLANS, createInvoice } from './payments.js';

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required to start the bot!');
}

const bot = new Telegraf(config.BOT_TOKEN);

// Middleware to safely catch errors in answerCbQuery (e.g. timeout or connection drops)
bot.use(async (ctx, next) => {
  if (ctx.answerCbQuery) {
    const originalAnswer = ctx.answerCbQuery;
    ctx.answerCbQuery = function (...args) {
      return originalAnswer.apply(this, args).catch(err => {
        console.warn('⚠️ Safe answerCbQuery caught error:', err.message);
      });
    };
  }
  return next();
});

// Middleware to register/update user in DB on every message
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const tgId = ctx.from.id;
    const existingUser = await db.getUser(tgId);

    if (!existingUser) {
      let referredBy = null;
      if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start')) {
        const parts = ctx.message.text.split(' ');
        if (parts.length > 1) {
          const payload = parts[1];
          const referrerId = parseInt(payload.replace('ref_', ''), 10);
          if (!isNaN(referrerId) && referrerId !== tgId) {
            referredBy = referrerId;
          }
        }
      }

      await db.createUser(tgId, ctx.from.username || '', ctx.from.first_name || '', referredBy);

      if (referredBy) {
        console.log(`User ${tgId} was referred by ${referredBy}`);
        try {
          await ctx.telegram.sendMessage(
            referredBy,
            `👤 Новый пользователь зарегистрировался по вашей реферальной ссылке!\nВы получите <b>+3 дня</b> к подписке, когда он активирует пробный период.`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.error(`Failed to notify referrer ${referredBy}:`, e.message);
        }
      }
    } else {
      await db.createUser(tgId, ctx.from.username || '', ctx.from.first_name || '');
    }
  }
  return next();
});

// Helper to handle messages sent by users in support mode
async function handleSupportMessage(ctx) {
  const tgId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name || 'Пользователь';
  
  const supportChatId = config.SUPPORT_CHAT_ID || (config.ADMIN_TG_IDS.length > 0 ? config.ADMIN_TG_IDS[0] : null);
  
  if (!supportChatId) {
    console.error('❌ Support chat ID and Admin TG IDs are not configured. Cannot forward support message.');
    await ctx.reply('⚠️ К сожалению, служба поддержки сейчас недоступна. Пожалуйста, обратитесь к @knightvpn_help позже.');
    return;
  }
  
  try {
    // 1. Send the ticket header info message
    const userLink = username ? `@${username}` : `<a href="tg://user?id=${tgId}">${firstName}</a>`;
    const headerText = `🎫 <b>Новое обращение в поддержку</b>\n` +
      `👤 От: ${userLink} (ID: <code>${tgId}</code>)`;
      
    const headerMsg = await ctx.telegram.sendMessage(supportChatId, headerText, { parse_mode: 'HTML' });
    
    // 2. Copy the actual user's message as a reply to the header
    const copiedMsg = await ctx.telegram.copyMessage(
      supportChatId,
      ctx.chat.id,
      ctx.message.message_id,
      {
        reply_to_message_id: headerMsg.message_id
      }
    );
    
    // 3. Save the mappings in database for BOTH messages
    await db.createSupportMessageMapping(headerMsg.message_id, tgId, ctx.message.message_id);
    await db.createSupportMessageMapping(copiedMsg.message_id, tgId, ctx.message.message_id);
    
    // 4. Acknowledge to the user
    const userAckKeyboard = {
      inline_keyboard: [[{ text: '❌ Выйти из поддержки', callback_data: 'exit_support' }]]
    };
    await ctx.reply(
      `✉️ <b>Ваше сообщение отправлено поддержке.</b>\n` +
      `Ожидайте ответа прямо в этом чате. Вы можете отправить дополнительные файлы/сообщения или выйти из поддержки, нажав кнопку ниже.`,
      { parse_mode: 'HTML', reply_markup: userAckKeyboard }
    );
  } catch (error) {
    console.error('Error forwarding support message:', error);
    await ctx.reply('❌ Произошла ошибка при отправке сообщения. Пожалуйста, попробуйте еще раз.');
  }
}

// Helper to handle admin replies in support chat
async function handleSupportReply(ctx) {
  const repliedMsgId = ctx.message.reply_to_message.message_id;
  const mapping = await db.getSupportMessageMapping(repliedMsgId);
  
  if (!mapping) {
    return;
  }
  
  const userId = mapping.user_id;
  
  try {
    const keyboard = {
      inline_keyboard: [[{ text: '✍️ Написать ответ', callback_data: 'ask_support' }]]
    };
    await ctx.telegram.sendMessage(userId, `✉️ <b>Ответ службы поддержки:</b>`, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
    await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id);
    
    const status = await ctx.reply(`✅ Ответ успешно отправлен пользователю.`);
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
    }, 5000);
  } catch (error) {
    console.error(`Failed to send reply to user ${userId}:`, error);
    await ctx.reply(`❌ Не удалось отправить ответ пользователю. Возможно, он заблокировал бота.`);
  }
}

// Middleware to clear support mode when navigating away via callback queries
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && ctx.callbackQuery.data !== 'ask_support') {
    const tgId = ctx.from.id;
    if (await db.isSupportMode(tgId)) {
      await db.setSupportMode(tgId, 0);
    }
  }
  return next();
});

// Middleware to route support messages and support replies
bot.use(async (ctx, next) => {
  if (ctx.message) {
    const tgId = ctx.from.id;
    
    // Check if user is in support mode
    const isSupport = await db.isSupportMode(tgId);
    if (isSupport) {
      // If it's a command, exit support mode and continue
      if (ctx.message.text && ctx.message.text.startsWith('/')) {
        await db.setSupportMode(tgId, 0);
        return next();
      }
      await handleSupportMessage(ctx);
      return;
    }
    
    // Check if it's a reply in the support chat
    const supportChatId = config.SUPPORT_CHAT_ID || (config.ADMIN_TG_IDS.length > 0 ? config.ADMIN_TG_IDS[0] : null);
    if (supportChatId && ctx.chat.id === supportChatId && ctx.message.reply_to_message) {
      if (ctx.message.text && ctx.message.text.startsWith('/')) {
        return next();
      }
      await handleSupportReply(ctx);
      return;
    }
  }
  return next();
});


// Helper to check admin access
function isAdmin(tgId) {
  return config.ADMIN_TG_IDS.includes(tgId);
}

// Helper to either edit existing photo message caption or send a new photo message
async function sendOrEditMessage(ctx, text, replyMarkup) {
  const isCallback = !!ctx.callbackQuery;
  const hasPhoto = ctx.callbackQuery && ctx.callbackQuery.message && ctx.callbackQuery.message.photo;
  
  if (isCallback && hasPhoto) {
    try {
      await ctx.editMessageCaption(text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      return;
    } catch (err) {
      // If no change or other error, fallback to sending new message
      console.log('Error in editMessageCaption, sending new message:', err.message);
    }
  }
  
  // Try to delete the user's incoming message to keep the chat tidy
  if (ctx.message && ctx.chat) {
    try {
      await ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    } catch (e) {}
  }
  
  await ctx.replyWithPhoto(config.BOT_BANNER, {
    caption: text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
}

// Generate Main Menu Keyboard (Inline)
function getMainMenuKeyboard(tgId) {
  const buttons = [
    [
      { text: '👤 Мой профиль', callback_data: 'show_profile' },
      { text: '💳 Купить подписку', callback_data: 'show_buy_menu' }
    ],
    [
      { text: '⚙️ Инструкция', callback_data: 'show_instructions' },
      { text: '🆘 Поддержка', callback_data: 'show_support' }
    ]
  ];
  if (isAdmin(tgId)) {
    buttons.push([{ text: '👑  Админ-панель', callback_data: 'show_admin_panel' }]);
  }
  return { inline_keyboard: buttons };
}

// Send Main Menu
async function sendMainMenu(ctx) {
  const name = ctx.from.first_name || 'друг';
  const welcomeText = `👋 <b>Привет, ${name}!</b>\n\n` +
    `🛡 <b>Наш сервис предоставляет:</b>\n` +
    `• Высокоскоростной и стабильный доступ без каких-либо блокировок\n` +
    `• Современный и незаметный протокол шифрования <b>VLESS Reality</b>\n` +
    `• Безлимитный трафик на максимальной скорости\n` +
    `• Поддержку всех ваших устройств (iOS, Android, Windows, macOS)\n` +
    `• Удобное подключение за 1 минуту через приложение <b>Happ</b>\n\n` +
    `🎁 Для новых пользователей доступен <b>бесплатный пробный период на 3 дня</b>!\n` +
    `Перейдите в раздел 👤 <b>Мой профиль</b>, чтобы активировать его.`;

  await sendOrEditMessage(ctx, welcomeText, getMainMenuKeyboard(ctx.from.id));
}

// Command /start
bot.start(async (ctx) => {
  // Try to remove old reply keyboard if the user has one
  try {
    const msg = await ctx.reply('Загрузка меню...', {
      reply_markup: { remove_keyboard: true }
    });
    await ctx.deleteMessage(msg.message_id).catch(() => {});
  } catch (e) {}
  
  await db.setSupportMode(ctx.from.id, 0);
  await sendMainMenu(ctx);
});

// Show User Profile
async function showProfile(ctx) {
  const tgId = ctx.from.id;
  const user = await db.getUser(tgId);
  const activeSub = await db.getActiveSubscription(tgId);

  let profileText = `👤 <b>Ваш профиль:</b>\n\n`;
  profileText += `• <b>Ваш Telegram ID:</b> <code>${tgId}</code>\n`;
  
  const buttons = [];

  if (activeSub) {
    const expiryDate = new Date(activeSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    let activeIpsCount = 0;
    try {
      const activeIps = await xuiApi.getClientIps(activeSub.client_email);
      activeIpsCount = activeIps.length;
    } catch (err) {
      console.error('Error fetching active IPs for profile:', err);
    }
    
    profileText += `• <b>Статус подписки:</b> ✅ Активна\n`;
    const devices = activeSub.limit_ip || 1;
    const deviceWord = devices === 1 ? 'устройство' : ([2, 3, 4].includes(devices) ? 'устройства' : 'устройств');
    profileText += `• <b>Тарифный план:</b> ${devices} ${deviceWord}\n`;
    profileText += `• <b>Активно устройств:</b> <code>${activeIpsCount} из ${devices}</code>\n`;
    profileText += `• <b>Активна до (МСК):</b> <code>${expiryDate}</code>\n\n`;
    profileText += `📥 Ваш персональный ключ доступа к Knight VPN готов. Нажмите на кнопку ниже, чтобы получить его.`;

    buttons.push([{ text: '🔑 Получить ключ доступа', callback_data: 'get_key' }]);
    buttons.push([{ text: '🔄 Продлить подписку', callback_data: 'show_buy_menu' }]);
  } else {
    profileText += `• <b>Статус подписки:</b> ❌ Неактивна\n\n`;
    
    if (user && !user.trial_used) {
      profileText += `🎁 Вам доступен бесплатный пробный период на 3 дня!`;
      buttons.push([{ text: '🎁 Активировать тест (3 дня)', callback_data: 'activate_trial' }]);
    } else {
      profileText += `Для подключения к VPN, пожалуйста, приобретите подписку.`;
    }
    
    buttons.push([{ text: '💳 Купить подписку', callback_data: 'show_buy_menu' }]);
  }
  
  // Add Referral Program button to all users
  buttons.push([{ text: '👥 Реферальная программа', callback_data: 'show_referral' }]);
  
  buttons.push([{ text: '🔙 Главное меню', callback_data: 'back_to_main' }]);

  await sendOrEditMessage(ctx, profileText, { inline_keyboard: buttons });
}

// Show Buy Menu (Select Duration)
async function showBuyMenu(ctx) {
  const text = `💳 <b>Выберите длительность подписки Knight VPN:</b>\n\n` +
    `Выберите подходящий период действия подписки. На следующем шаге вы сможете настроить количество необходимых устройств.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📅 1 месяц', callback_data: 'buy_dur:1month' },
        { text: '📅 3 месяца', callback_data: 'buy_dur:3months' }
      ],
      [
        { text: '📅 6 месяцев', callback_data: 'buy_dur:6months' }
      ],
      [
        { text: '🔙 Главное меню', callback_data: 'back_to_main' }
      ]
    ]
  };

  await sendOrEditMessage(ctx, text, keyboard);
}

// Show Device Selection for a chosen duration
async function showDeviceSelect(ctx, duration) {
  let durationText = '';
  if (duration === '1month') durationText = '1 месяц';
  else if (duration === '3months') durationText = '3 месяца';
  else if (duration === '6months') durationText = '6 месяцев';

  const text = `📱 <b>Тариф на ${durationText}</b>\n\n` +
    `Выберите количество устройств для одновременного подключения:`;

  const plansForDuration = Object.keys(PLANS)
    .filter(key => key.startsWith(duration + '_'))
    .map(key => PLANS[key]);

  const buttons = [];
  plansForDuration.forEach(plan => {
    buttons.push([{
      text: `${plan.devices} ${plan.devices === 1 ? 'устройство' : ([2, 3, 4].includes(plan.devices) ? 'устройства' : 'устройств')} — ${plan.price} ₽`,
      callback_data: `buy_select:${plan.id}`
    }]);
  });
  
  buttons.push([{ text: '🔙 Назад к выбору срока', callback_data: 'show_buy_menu' }]);

  await sendOrEditMessage(ctx, text, { inline_keyboard: buttons });
}

// Action to handle plan selection (generate invoice / manual details)
const buyPlanAction = async (ctx, planId) => {
  const tgId = ctx.from.id;
  const plan = PLANS[planId];
  
  if (!plan) return ctx.answerCbQuery('Неверный тариф');

  // Fallback to manual payment if YOOKASSA_TOKEN is not set
  if (!config.YOOKASSA_TOKEN || config.YOOKASSA_TOKEN === 'YOUR_YOOKASSA_PROVIDER_TOKEN') {
    await ctx.answerCbQuery();
    const manualPaymentText = `💳 <b>Оплата тарифа «${plan.name}»:</b>\n\n` +
      `• <b>Сумма к оплате:</b> <code>${plan.price} ₽</code>\n` +
      `• <b>Лимит устройств:</b> ${plan.devices} шт.\n` +
      `• <b>Способ оплаты:</b> Перевод на карту или СБП\n` +
      `• <b>Реквизиты:</b> <code>[Здесь будут указаны ваши реквизиты]</code>\n\n` +
      `После оплаты, пожалуйста, отправьте скриншот чека/квитанции администратору: @knightvpn_help\n\n` +
      `После подтверждения администратор сразу активирует ваш доступ. Пожалуйста, укажите ваш Telegram ID: <code>${tgId}</code> в сообщении с чеком.`;

    const backButton = {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: `buy_dur:${planId.split('_')[0]}` }]]
    };
    return sendOrEditMessage(ctx, manualPaymentText, backButton);
  }
  
  await ctx.answerCbQuery('Создаем счет...');
  
  try {
    const invoice = createInvoice(planId, tgId);
    
    // Save to DB as pending payment
    const uniqueInvoicePayload = JSON.parse(invoice.payload);
    const paymentId = `pay_${tgId}_${uniqueInvoicePayload.timestamp}`;
    
    // Rewrite payload to store database billing reference
    invoice.payload = paymentId;
    
    await db.createPayment(tgId, paymentId, plan.price, planId);
    
    // Inform user in the same message that invoice has been sent below
    const statusText = `💳 <b>Счет на оплату тарифа «${plan.name}» сформирован!</b>\n\n` +
      `Пожалуйста, произведите оплату с помощью счета, отправленного ниже. После успешной оплаты ваша подписка активируется/продлится автоматически.`;

    const backButton = {
      inline_keyboard: [[{ text: '🔙 Выбор устройств', callback_data: `buy_dur:${planId.split('_')[0]}` }]]
    };
    
    await sendOrEditMessage(ctx, statusText, backButton);
    
    // Send invoice as a new message
    await ctx.replyWithInvoice(invoice);
  } catch (error) {
    console.error('Invoice creation error:', error);
    await ctx.answerCbQuery('Ошибка создания счета');
    await sendOrEditMessage(ctx, '❌ Произошла ошибка при выставлении счета. Обратитесь к администратору.', {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'show_buy_menu' }]]
    });
  }
};

// Show Instructions Menu
async function showInstructions(ctx) {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);
  const webAppUrl = activeSub 
    ? `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}` 
    : `${config.SUB_SERVER_URL}/import`;

  const instructionsText = `🚀 <b>Настройка Knight VPN — это очень просто!</b>\n\n` +
    `Мы разработали интерактивного помощника, который поможет вам установить нужное приложение и подключить подписку всего за пару кликов.\n\n` +
    `Выберите вариант:\n` +
    `• Нажмите <b>«🚀 Начать установку»</b>, чтобы открыть пошаговые инструкции и скачать приложение для вашего устройства.\n` +
    `• Если вы уже знаете, как настроить VPN, нажмите <b>«🔑 Получить ключ»</b>, чтобы скопировать ссылку подписки.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 Начать установку', web_app: { url: webAppUrl } }
      ],
      [
        { text: '🔑 Получить ключ', callback_data: 'get_key' }
      ],
      [
        { text: '🔙 Главное меню', callback_data: 'back_to_main' }
      ]
    ]
  };

  await sendOrEditMessage(ctx, instructionsText, keyboard);
}

// Show Support Info
async function showSupport(ctx) {
  const supportText = `🆘 <b>Служба поддержки Knight VPN</b>\n\n` +
    `Здесь вы можете задать любой вопрос нашей службе поддержки.\n\n` +
    `Нажмите кнопку <b>«✍️ Написать вопрос»</b> ниже, а затем отправьте ваше сообщение (текст, фото/скриншот или голосовое).\n\n` +
    `Наш менеджер ответит вам в этом чате в ближайшее время!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✍️ Написать вопрос', callback_data: 'ask_support' }],
      [{ text: '🔙 Главное меню', callback_data: 'back_to_main' }]
    ]
  };

  await sendOrEditMessage(ctx, supportText, keyboard);
}

// Show Admin Panel Info
async function showAdminPanel(ctx) {
  const stats = await db.getStats();
  const adminText = `👑 <b>Панель администратора:</b>\n\n` +
    `📊 <b>Статистика:</b>\n` +
    `• Всего пользователей: <code>${stats.totalUsers}</code>\n` +
    `• Активных участников: <code>${stats.activeSubscribers}</code>\n` +
    `• Всего заработано: <code>${stats.totalEarnings} ₽</code>\n\n` +
    `📝 <b>Команды управления:</b>\n` +
    `• <code>/give [id] [days]</code> — Предоставить/продлить доступ пользователю на X дней.\n` +
    `  Пример: <code>/give 123456789 30</code>\n` +
    `• <code>/broadcast [текст]</code> — Отправить сообщение всем участникам.\n` +
    `  Пример: <code>/broadcast Внимание! Проводятся технические работы.</code>`;

  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Главное меню', callback_data: 'back_to_main' }]]
  };

  await sendOrEditMessage(ctx, adminText, keyboard);
}

// --- CALLBACK ACTIONS ---
bot.action(['show_profile', 'profile_menu'], async (ctx) => {
  await ctx.answerCbQuery();
  await showProfile(ctx);
});

bot.action(['show_buy_menu', 'buy_menu'], async (ctx) => {
  await ctx.answerCbQuery();
  await showBuyMenu(ctx);
});

bot.action('show_instructions', async (ctx) => {
  await ctx.answerCbQuery();
  await showInstructions(ctx);
});

bot.action('show_support', async (ctx) => {
  await ctx.answerCbQuery();
  await showSupport(ctx);
});

bot.action('ask_support', async (ctx) => {
  await ctx.answerCbQuery();
  const tgId = ctx.from.id;
  await db.setSupportMode(tgId, 1);
  
  const text = `✍️ <b>Режим поддержки активирован!</b>\n\n` +
    `Напишите ваш вопрос или отправьте скриншот/файл. Вы можете отправить несколько сообщений подряд.\n\n` +
    `Для завершения диалога или возврата назад нажмите кнопку ниже:`;
    
  const keyboard = {
    inline_keyboard: [[{ text: '❌ Выйти из поддержки', callback_data: 'exit_support' }]]
  };
  
  await sendOrEditMessage(ctx, text, keyboard);
});

bot.action('exit_support', async (ctx) => {
  await ctx.answerCbQuery('Вы вышли из поддержки');
  const tgId = ctx.from.id;
  await db.setSupportMode(tgId, 0);
  await sendMainMenu(ctx);
});

bot.action('show_admin_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await showAdminPanel(ctx);
});

bot.action('show_referral', async (ctx) => {
  await ctx.answerCbQuery();
  const tgId = ctx.from.id;
  const botUsername = ctx.botInfo?.username || 'KnightVPN_bot';
  const refLink = `https://t.me/${botUsername}?start=ref_${tgId}`;

  const stats = await db.getReferralStats(tgId);
  const totalDays = stats.activeReferred * 3;

  const text = `👥 <b>Реферальная программа</b>\n\n` +
    `Приглашайте друзей и получайте бонусные дни подписки!\n` +
    `Когда кто-то переходит по вашей ссылке и активирует <b>пробный период</b>, вы получаете <b>+3 дня</b> к своей подписке.\n\n` +
    `🔗 <b>Ваша реферальная ссылка:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `📊 <b>Ваша статистика:</b>\n` +
    `• Перешли по ссылке: <code>${stats.totalReferred}</code>\n` +
    `• Активировали тест: <code>${stats.activeReferred}</code>\n` +
    `• Бонусных дней получено: <code>${totalDays} дн.</code>\n\n` +
    `<i>Нажмите на ссылку выше, чтобы скопировать её и отправить друзьям.</i>`;

  const shareText = `Привет! Попробуй Knight VPN — быстрый и безопасный VPN-сервис для обхода любых блокировок. Дают 3 дня бесплатного теста по моей ссылке! 🎁`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✉️ Поделиться ссылкой', url: shareUrl }],
      [{ text: '🔙 Назад в профиль', callback_data: 'show_profile' }]
    ]
  };

  await sendOrEditMessage(ctx, text, keyboard);
});

bot.action('back_to_main', async (ctx) => {
  await ctx.answerCbQuery();
  await sendMainMenu(ctx);
});

bot.action('get_key', async (ctx) => {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);

  if (!activeSub) {
    return ctx.answerCbQuery('У вас нет активной подписки!', { show_alert: true });
  }

  await ctx.answerCbQuery();
  
  const keyText = `🔑 <b>Ваша персональная ссылка для подписки:</b>
<code>${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её.</i>

⚙️ <b>Быстрая настройка через Happ (рекомендуется):</b>
1. Установите приложение <b>Happ</b> (ссылки для скачивания в разделе «⚙️ Инструкция»)
2. Скопируйте вашу ссылку подписки выше
3. Откройте приложение, нажмите значок <b>➕</b> в верхнем правом углу (или кнопку импорта)
4. Выберите <b>«Добавить из буфера обмена»</b>
5. Нажмите кнопку подключения в центре экрана

⚠️ <b>Внимание:</b> На резервном обходном ключе установлен лимит трафика 15 ГБ. Использование торрентов на обходном профиле строго запрещено!`;

  const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Начать установку', web_app: { url: autoImportRedirectUrl } }],
      [{ text: '🔙 Назад в профиль', callback_data: 'show_profile' }]
    ]
  };

  await sendOrEditMessage(ctx, keyText, keyboard);
});

async function awardReferralBonus(ctx, referrerId) {
  try {
    const activeSub = await db.getActiveSubscription(referrerId);
    let expiresAt;

    if (activeSub) {
      const updatedSub = await db.extendSubscription(referrerId, 3);
      expiresAt = updatedSub.expires_at;

      const devices = activeSub.limit_ip || 1;
      const client = await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid, devices);
      if (client.connectionUrl) {
        await db.updateSubscriptionUrls(referrerId, client.connectionUrl, client.bypassConnectionUrl);
      }
    } else {
      const email = `vpn_user_${referrerId}`;
      let uuid = crypto.randomUUID();

      const expiredSub = await db.getSubscriptionByEmail(email);
      if (expiredSub) {
        uuid = expiredSub.client_uuid;
      }

      const client = await xuiApi.addClient(email, uuid, 1);
      if (client.error && !xuiApi.mockMode) {
        console.error('3x-ui API Error during referral subscription creation:', client.error);
      }

      const newSub = await db.createSubscription(
        referrerId,
        client.email,
        client.uuid,
        client.connectionUrl,
        'Referral Bonus',
        3,
        1,
        client.bypassConnectionUrl
      );
      expiresAt = newSub.expires_at;
    }

    const expiryStr = new Date(expiresAt.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    await ctx.telegram.sendMessage(
      referrerId,
      `🎁 <b>Бонус за приглашение!</b>\n\nПользователь, зарегистрировавшийся по вашей ссылке, активировал тест.\nВам начислено <b>+3 дня</b> подписки.\n\nПодписка активна до (МСК): <code>${expiryStr}</code>`,
      { parse_mode: 'HTML' }
    ).catch(err => {
      console.warn(`Could not notify referrer ${referrerId} about bonus:`, err.message);
    });
  } catch (error) {
    console.error(`Error awarding referral bonus to ${referrerId}:`, error);
  }
}

bot.action('activate_trial', async (ctx) => {
  const tgId = ctx.from.id;
  const user = await db.getUser(tgId);

  if (user && user.trial_used) {
    return ctx.answerCbQuery('Вы уже использовали пробный доступ!', { show_alert: true });
  }

  await ctx.answerCbQuery('Активация пробного периода...');
  
  await sendOrEditMessage(ctx, '⏳ Секунду, создаем ваш профиль на сервере...', { inline_keyboard: [] });

  try {
    const email = `vpn_user_${tgId}`;
    const client = await xuiApi.addClient(email);

    if (client.error && !xuiApi.mockMode) {
      throw new Error(client.error);
    }

    await db.createSubscription(
      tgId,
      client.email,
      client.uuid,
      client.connectionUrl,
      PLANS.trial.name,
      PLANS.trial.days,
      PLANS.trial.devices,
      client.bypassConnectionUrl
    );

    await db.markTrialUsed(tgId);

    if (user && user.referred_by) {
      await awardReferralBonus(ctx, user.referred_by);
    }

    const keyText = `🎉 <b>Пробный доступ успешно активирован!</b>

Доступ к Knight VPN предоставлен на 3 дня (1 устройство).

🔑 <b>Ваша ссылка для подписки:</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция».</i>`;

    const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${client.uuid}`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Начать установку', web_app: { url: autoImportRedirectUrl } }],
        [{ text: '⚙️ Инструкция', callback_data: 'show_instructions' }],
        [{ text: '🔙 В профиль', callback_data: 'show_profile' }]
      ]
    };
    await sendOrEditMessage(ctx, keyText, keyboard);
  } catch (error) {
    console.error('Trial activation error:', error);
    await sendOrEditMessage(ctx, '❌ Произошла ошибка при создании ключа доступа. Пожалуйста, обратитесь в поддержку.', {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'show_profile' }]]
    });
  }
});

bot.action(/^buy_dur:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const duration = ctx.match[1];
  await showDeviceSelect(ctx, duration);
});

bot.action(/^buy_select:(.+)$/, async (ctx) => {
  const planId = ctx.match[1];
  await buyPlanAction(ctx, planId);
});

// Retro-compatibility with old buttons in telegram client
bot.hears('👤 Мой профиль', async (ctx) => {
  await showProfile(ctx);
});

bot.hears('💳 Оформить доступ', async (ctx) => {
  await showBuyMenu(ctx);
});

bot.hears('⚙️ Инструкция по авторизации', async (ctx) => {
  await showInstructions(ctx);
});

bot.hears('🆘 Поддержка', async (ctx) => {
  await showSupport(ctx);
});

bot.hears('👑  Админ-панель', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await showAdminPanel(ctx);
});

// --- TELEGRAM PAYMENTS HANDLERS ---

bot.on('pre_checkout_query', async (ctx) => {
  const paymentId = ctx.preCheckoutQuery.invoice_payload;
  console.log(`💳 PreCheckout Query received for: ${paymentId}`);
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    console.error('PreCheckout error:', error);
    await ctx.answerPreCheckoutQuery(false, 'Произошла ошибка при обработке заказа. Пожалуйста, попробуйте еще раз.');
  }
});

bot.on('successful_payment', async (ctx) => {
  const paymentInfo = ctx.message.successful_payment;
  const paymentId = paymentInfo.invoice_payload;
  const tgId = ctx.from.id;

  console.log(`✅ Successful Payment received: ${paymentId} from user ${tgId}`);

  try {
    const dbPayment = await db.completePayment(paymentId);
    if (!dbPayment) {
      console.error(`Warning: payment ${paymentId} was completed but not found in DB.`);
    }

    const planId = dbPayment ? dbPayment.plan_id : '1month_1';
    const plan = PLANS[planId] || PLANS['1month_1'];

    const activeSub = await db.getActiveSubscription(tgId);
    let updatedSub;

    if (activeSub) {
      updatedSub = await db.extendSubscription(tgId, plan.days, plan.devices);
      const client = await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid, updatedSub.limit_ip || plan.devices);
      if (client.connectionUrl) {
        await db.updateSubscriptionUrls(tgId, client.connectionUrl, client.bypassConnectionUrl);
      }

      await ctx.reply(`🎉 <b>Оплата успешно получена!</b>

Ваша подписка Knight VPN продлена на <b>${plan.days} дней</b>.
Новая дата окончания (МСК): <code>${new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU')}</code>

Ваш персональный ключ доступа остается прежним!`, { parse_mode: 'HTML' });
    } else {
      const email = `vpn_user_${tgId}`;
      let uuid = crypto.randomUUID();
      
      const expiredSub = await db.getSubscriptionByEmail(email);
      if (expiredSub) {
        uuid = expiredSub.client_uuid;
      }

      const client = await xuiApi.addClient(email, uuid, plan.devices);
      
      if (client.error && !xuiApi.mockMode) {
        console.error('3x-ui API Error during payment registration:', client.error);
      }

      updatedSub = await db.createSubscription(
        tgId,
        client.email,
        client.uuid,
        client.connectionUrl,
        plan.name,
        plan.days,
        plan.devices,
        client.bypassConnectionUrl
      );

      const keyText = `🎉 <b>Оплата успешно получена! Подписка Knight VPN активирована!</b>

Спасибо за покупку! Доступ предоставлен на <b>${plan.days} дней</b>.
Действует до (МСК): <code>${new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU')}</code>

🔑 <b>Ваша персональная ссылка для подписки:</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция».</i>`;

      const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${client.uuid}`;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Начать установку', autoImportRedirectUrl)],
        [Markup.button.callback('⚙️ Инструкция', 'show_instructions')]
      ]);
      await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    console.error('Successful payment processing error:', error);
    await ctx.reply('❌ Оплата прошла, но произошла ошибка при активации доступа на сервере. Пожалуйста, перешлите это сообщение администратору для ручной выдачи доступа.');
  }
});



// --- ADMIN COMMANDS ---

bot.command('give', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    return ctx.reply('❌ Недостаточно аргументов. Использование: <code>/give [id_пользователя] [кол-во_дней]</code>', { parse_mode: 'HTML' });
  }

  const targetId = parseInt(args[0], 10);
  const days = parseInt(args[1], 10);

  if (isNaN(targetId) || isNaN(days)) {
    return ctx.reply('❌ Неверный формат аргументов. ID и дни должны быть числами.');
  }

  try {
    const user = await db.getUser(targetId);
    if (!user) {
      return ctx.reply(`❌ Пользователь с ID ${targetId} не зарегистрирован в системе.`);
    }

    const activeSub = await db.getActiveSubscription(targetId);
    let updatedSub;

    if (activeSub) {
      updatedSub = await db.forceExtendUser(targetId, days);
      const client = await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid, activeSub.limit_ip);
      if (client.connectionUrl) {
        await db.updateSubscriptionUrls(targetId, client.connectionUrl, client.bypassConnectionUrl);
      }
    } else {
      const email = `vpn_user_${targetId}`;
      let uuid = crypto.randomUUID();
      
      const expiredSub = await db.getSubscriptionByEmail(email);
      if (expiredSub) {
        uuid = expiredSub.client_uuid;
      }

      const client = await xuiApi.addClient(email, uuid, 1);
      updatedSub = await db.createSubscription(
        targetId,
        client.email,
        client.uuid,
        client.connectionUrl,
        'Выдано админом',
        days,
        1,
        client.bypassConnectionUrl
      );
    }

    const expiryDate = new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU');

    await ctx.reply(`✅ Пользователю <code>${targetId}</code> успешно выдан доступ на <b>${days} дней</b>.\nНовая дата окончания: <code>${expiryDate}</code>`, { parse_mode: 'HTML' });

    try {
      const userKeyText = `🎁 <b>Администратор предоставил/продлил вам подписку Knight VPN на ${days} дней!</b>

Новая дата окончания (МСК): <code>${expiryDate}</code>

🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${updatedSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция».</i>`;

      const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${updatedSub.client_uuid}`;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Начать установку', autoImportRedirectUrl)],
        [Markup.button.callback('⚙️ Инструкция', 'show_instructions')]
      ]);
      await bot.telegram.sendMessage(targetId, userKeyText, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.warn(`Could not notify user ${targetId} via PM:`, err.message);
    }

  } catch (error) {
    console.error('Error in /give command:', error);
    await ctx.reply('❌ Ошибка выполнения команды.');
  }
});

bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const text = ctx.message.text.substring(11).trim();
  if (!text) {
    return ctx.reply('❌ Напишите текст сообщения после команды. Пример: <code>/broadcast Всем привет!</code>', { parse_mode: 'HTML' });
  }

  const users = await db.getAllUsers();
  await ctx.reply(`📣 Начинаю рассылку для ${users.length} пользователей...`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.tg_id, text, { parse_mode: 'HTML' });
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      failCount++;
    }
  }

  await ctx.reply(`📢 <b>Рассылка завершена!</b>\n\n✅ Успешно отправлено: <code>${successCount}</code>\n❌ Ошибок отправки: <code>${failCount}</code>`, { parse_mode: 'HTML' });
});

bot.catch((err, ctx) => {
  console.error(`❌ Telegraf caught an error for update ${ctx?.update?.update_id}:`, err);
});

export default bot;
