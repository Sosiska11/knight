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
    await db.createUser(ctx.from.id, ctx.from.username || '', ctx.from.first_name || '');
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
  const instructionsText = `⚙️ <b>Инструкция по подключению к Knight VPN</b>\n\n` +
    `Выберите вашу операционную систему / устройство для настройки подключения:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🍏 iOS (iPhone/iPad)', callback_data: 'inst_ios' },
        { text: '🤖 Android', callback_data: 'inst_android' }
      ],
      [
        { text: '💻 Windows', callback_data: 'inst_windows' },
        { text: '🍎 macOS', callback_data: 'inst_macos' }
      ],
      [
        { text: '🔙 Главное меню', callback_data: 'back_to_main' }
      ]
    ]
  };

  await sendOrEditMessage(ctx, instructionsText, keyboard);
}

// Show specific OS instructions
const showInstruction = (os) => async (ctx) => {
  await ctx.answerCbQuery();

  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);
  const subUrl = activeSub ? `${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}` : null;
  const autoImportUrl = subUrl ? `sing-box://import-remote?url=${encodeURIComponent(subUrl)}` : null;
  const autoImportRedirectUrl = activeSub ? `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}` : null;

  let text = '';
  let inlineKeyboard = [];
  
  if (os === 'ios') {
    text = `🍏 <b>Подключение на iOS (iPhone, iPad)</b>\n\n` +
      `1️⃣ <b>Установите приложение Happ:</b>\n` +
      `Нажмите кнопку <b>«Скачать из App Store»</b> ниже.\n\n` +
      `2️⃣ <b>Добавьте подписку:</b>\n` +
      `${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):\n` +
      `👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>\n\n` +
      `<i>Если авто-импорт не сработал:</i>\n` +
      `• Скопируйте ссылку подписки вручную из раздела «👤 Мой профиль».\n` +
      `• Откройте <b>Happ</b>, нажмите значок <b>➕</b> в верхнем правом углу (или кнопку импорта) и выберите <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>\n` +
      `Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}\n\n` +
      `3️⃣ <b>Подключитесь:</b>\n` +
      `Нажмите круглую кнопку в центре экрана для запуска VPN. Разрешите системе добавить конфигурацию VPN.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Приложение будет автоматически обновлять конфигурации.</i>`;

    inlineKeyboard.push([{ text: '📥 App Store', url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215' }]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([{ text: '⚡️ Авто-импорт в Happ', url: autoImportRedirectUrl }]);
    }
    inlineKeyboard.push([
      { text: '🔑 Получить ключ', callback_data: 'get_key_from_inst' },
      { text: '🔙 Назад', callback_data: 'show_instructions' }
    ]);

  } else if (os === 'android') {
    text = `🤖 <b>Подключение на Android</b>\n\n` +
      `1️⃣ <b>Установите приложение Happ для Android:</b>\n` +
      `Скачайте <b>APK-файл</b> напрямую по кнопке ниже.\n\n` +
      `2️⃣ <b>Добавьте подписку:</b>\n` +
      `${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):\n` +
      `👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>\n\n` +
      `<i>Если авто-импорт не сработал:</i>\n` +
      `• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».\n` +
      `• Откройте <b>Happ</b>, нажмите значок <b>➕</b> и выберите <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>\n` +
      `Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}\n\n` +
      `3️⃣ <b>Подключитесь:</b>\n` +
      `Нажмите круглую кнопку в центре экрана для запуска VPN.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Приложение будет автоматически обновлять конфигурации.</i>`;

    inlineKeyboard.push([
      { text: '📥 Скачать Happ (.apk)', url: 'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk' }
    ]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([{ text: '⚡️ Авто-импорт в Happ', url: autoImportRedirectUrl }]);
    }
    inlineKeyboard.push([
      { text: '🔑 Получить ключ', callback_data: 'get_key_from_inst' },
      { text: '🔙 Назад', callback_data: 'show_instructions' }
    ]);

  } else if (os === 'windows') {
    text = `💻 <b>Подключение на Windows</b>\n\n` +
      `1️⃣ <b>Установите приложение Happ для Windows:</b>\n` +
      `Нажмите кнопку <b>«📥 Скачать для Windows»</b> ниже для перехода к скачиванию.\n\n` +
      `2️⃣ <b>Добавьте подписку:</b>\n` +
      `${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):\n` +
      `👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>\n\n` +
      `<i>Если авто-импорт не сработал:</i>\n` +
      `• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».\n` +
      `• В программе добавьте новый профиль из буфера обмена.` : `⚠️ <b>У вас нет активной подписки!</b>\n` +
      `Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}\n\n` +
      `3️⃣ <b>Подключитесь:</b>\n` +
      `Нажмите кнопку подключения для запуска VPN.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Приложение будет автоматически обновлять конфигурации.</i>`;

    inlineKeyboard.push([{ text: '📥 Скачать для Windows (.exe)', url: 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe' }]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([{ text: '⚡️ Авто-импорт в Happ', url: autoImportRedirectUrl }]);
    }
    inlineKeyboard.push([
      { text: '🔑 Получить ключ', callback_data: 'get_key_from_inst' },
      { text: '🔙 Назад', callback_data: 'show_instructions' }
    ]);

  } else if (os === 'macos') {
    text = `🍎 <b>Подключение на macOS</b>\n\n` +
      `1️⃣ <b>Установите приложение Happ:</b>\n` +
      `Скачайте из App Store по кнопке ниже.\n\n` +
      `2️⃣ <b>Добавьте подписку:</b>\n` +
      `${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):\n` +
      `👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>\n\n` +
      `<i>Если авто-импорт не сработал:</i>\n` +
      `• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».\n` +
      `• В программе <b>Happ</b> нажмите значок <b>➕</b> ➡️ <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>\n` +
      `Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}\n\n` +
      `3️⃣ <b>Подключитесь:</b>\n` +
      `Нажмите кнопку включения в программе для запуска VPN.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `<i>Рекомендуется использовать официальное приложение Happ для автоматического обновления профилей.</i>`;

    inlineKeyboard.push([
      { text: '📥 App Store', url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215' }
    ]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([{ text: '⚡️ Авто-импорт в Happ', url: autoImportRedirectUrl }]);
    }
    inlineKeyboard.push([
      { text: '🔑 Получить ключ', callback_data: 'get_key_from_inst' },
      { text: '🔙 Назад', callback_data: 'show_instructions' }
    ]);
  }

  await sendOrEditMessage(ctx, text, { inline_keyboard: inlineKeyboard });
};

// Show Support Info
async function showSupport(ctx) {
  const supportText = `🆘 <b>Служба поддержки Knight VPN</b>\n\n` +
    `Если у вас возникли вопросы по оплате, настройке или работе VPN — напишите администратору:\n\n` +
    `👨‍💻 <b>Контакты администратора:</b> @knightvpn_help\n\n` +
    `Опишите вашу проблему, указав ваш ID: <code>${ctx.from.id}</code>`;

  const keyboard = {
    inline_keyboard: [[{ text: '🔙 Главное меню', callback_data: 'back_to_main' }]]
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

bot.action('show_admin_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await showAdminPanel(ctx);
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

⚠️ <b>Внимание:</b> На резервном обходном ключе установлен лимит трафика 15 ГБ. Использование торрентов на обходном профиле строго запрещено!

<i>Если ваше приложение не поддерживает ссылки для подписки, вы можете получить статический ключ (VLESS) по кнопке ниже.</i>`;

  const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '⚡️ Установить в Happ', url: autoImportRedirectUrl }],
      [{ text: '🔑 Получить статический ключ (VLESS)', callback_data: 'get_static_key' }],
      [{ text: '🔙 Назад в профиль', callback_data: 'show_profile' }]
    ]
  };

  await sendOrEditMessage(ctx, keyText, keyboard);
});

bot.action('get_key_from_inst', async (ctx) => {
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

⚠️ <b>Внимание:</b> На резервном обходном ключе установлен лимит трафика 15 ГБ. Использование торрентов на обходном профиле строго запрещено!

<i>Если ваше приложение не поддерживает ссылки для подписки, вы можете получить статический ключ (VLESS) по кнопке ниже.</i>`;

  const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '⚡️ Установить в Happ', url: autoImportRedirectUrl }],
      [{ text: '🔑 Получить статический ключ (VLESS)', callback_data: 'get_static_key' }],
      [{ text: '🔙 Назад к инструкциям', callback_data: 'show_instructions' }]
    ]
  };

  await sendOrEditMessage(ctx, keyText, keyboard);
});

bot.action('get_static_key', async (ctx) => {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);

  if (!activeSub) {
    return ctx.answerCbQuery('У вас нет активного доступа!', { show_alert: true });
  }

  await ctx.answerCbQuery();

  let keyText = `🔑 <b>Ваш основной статический ключ доступа (VLESS):</b>
<code>${activeSub.connection_url}</code>

<i>Нажмите на ключ выше, чтобы скопировать его в буфер обмена.</i>`;

  if (activeSub.bypass_connection_url) {
    keyText += `\n\n🛡️ <b>Резервный ключ для обхода блокировок:</b>
<code>${activeSub.bypass_connection_url}</code>

<i>Используйте этот резервный ключ, если основной не подключается из-за блокировок вашего оператора.
⚠️ <b>Внимание:</b> На обходном ключе установлен лимит трафика 15 ГБ. Использование торрентов строго запрещено!</i>`;
  }

  keyText += `\n\n⚠️ <i>Используйте эти статические ключи только в том случае, если ваше приложение-клиент (например, v2rayNG или v2rayN) не поддерживает ссылки подписок.</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад к ссылке подписки', callback_data: 'get_key' }]
    ]
  };

  await sendOrEditMessage(ctx, keyText, keyboard);
});

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

    const keyText = `🎉 <b>Пробный доступ успешно активирован!</b>

Доступ к Knight VPN предоставлен на 3 дня (1 устройство).

🔑 <b>Ваша ссылка для подписки:</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция».</i>`;

    const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${client.uuid}`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚡️ Установить в Happ', url: autoImportRedirectUrl }],
        [{ text: '🔑 Получить статический ключ', callback_data: 'get_static_key' }],
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
        [Markup.button.url('⚡️ Установить ключ в Happ', autoImportRedirectUrl)],
        [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')]
      ]);
      await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    console.error('Successful payment processing error:', error);
    await ctx.reply('❌ Оплата прошла, но произошла ошибка при активации доступа на сервере. Пожалуйста, перешлите это сообщение администратору для ручной выдачи доступа.');
  }
});

bot.action('inst_ios', showInstruction('ios'));
bot.action('inst_android', showInstruction('android'));
bot.action('inst_windows', showInstruction('windows'));
bot.action('inst_macos', showInstruction('macos'));

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
        [Markup.button.url('⚡️ Установить ключ в Happ', autoImportRedirectUrl)],
        [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')]
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
