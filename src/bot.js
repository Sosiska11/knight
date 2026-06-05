import { Telegraf, Markup } from 'telegraf';
import config from './config.js';
import * as db from './database.js';
import xuiApi from './xui-api.js';
import { PLANS, createInvoice } from './payments.js';

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required to start the bot!');
}

const bot = new Telegraf(config.BOT_TOKEN);

// Middleware to register/update user in DB on every message
bot.use(async (ctx, next) => {
  if (ctx.from) {
    await db.createUser(ctx.from.id, ctx.from.username || '', ctx.from.first_name || '');
  }
  return next();
});

// Helper for check admin access
function isAdmin(tgId) {
  return config.ADMIN_TG_IDS.includes(tgId);
}

// Generate Main Menu Keyboard
function getMainMenuKeyboard(tgId) {
  const buttons = [
    ['👤 Мой профиль', '💳 Оформить доступ'],
    ['⚙️ Инструкция по авторизации', '🆘 Поддержка']
  ];
  if (isAdmin(tgId)) {
    buttons.push(['👑 Админ-панель']);
  }
  return Markup.keyboard(buttons).resize();
}

// Command /start
bot.start(async (ctx) => {
  const name = ctx.from.first_name || 'друг';
  const welcomeText = `
👋 <b>Привет, ${name}!</b>

Добро пожаловать в бот <b>Knight VPN</b>! 🚀

🛡 <b>Наш сервис предоставляет:</b>
• Высокоскоростной и стабильный доступ без каких-либо блокировок
• Современный и незаметный протокол шифрования <b>VLESS Reality</b>
• Безлимитный трафик на максимальной скорости
• Поддержку всех ваших устройств (iOS, Android, Windows, macOS)
• Удобное подключение за 1 минуту через приложение <b>Happ</b>

🎁 Для новых пользователей доступен <b>бесплатный пробный период на 3 дня</b>!
Перейдите в раздел 👤 <b>Мой профиль</b>, чтобы активировать его.
  `;

  await ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    ...getMainMenuKeyboard(ctx.from.id)
  });
});

// Handler for "👤 Мой профиль"
bot.hears('👤 Мой профиль', async (ctx) => {
  await showProfile(ctx);
});

async function showProfile(ctx) {
  const tgId = ctx.from.id;
  const user = await db.getUser(tgId);
  const activeSub = await db.getActiveSubscription(tgId);

  let profileText = `👤 <b>Ваш профиль:</b>\n`;
  profileText += `• <b>ID:</b> <code>${tgId}</code>\n`;
  
  const inlineButtons = [];

  if (activeSub) {
    // Format expiration date
    const expiryDate = new Date(activeSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    profileText += `• <b>Статус доступа:</b> ✅ Активен\n`;
    profileText += `• <b>Тариф:</b> ${activeSub.plan_name}\n`;
    profileText += `• <b>Действует до (МСК):</b> <code>${expiryDate}</code>\n\n`;
    profileText += `📥 Ваш персональный ключ доступа к Knight VPN готов. Нажмите на кнопку ниже, чтобы получить его.`;

    inlineButtons.push([Markup.button.callback('🔑 Получить ключ доступа', 'get_key')]);
    inlineButtons.push([Markup.button.callback('🔄 Продлить подписку', 'buy_menu')]);
  } else {
    profileText += `• <b>Статус доступа:</b> ❌ Неактивен\n\n`;
    
    if (user && !user.trial_used) {
      profileText += `🎁 Вам доступен бесплатный пробный доступ на 3 дня!`;
      inlineButtons.push([Markup.button.callback('🎁 Активировать тест (3 дня)', 'activate_trial')]);
    } else {
      profileText += `Для подключения к VPN, пожалуйста, оформите подписку.`;
    }
    
    inlineButtons.push([Markup.button.callback('💳 Оформить подписку', 'buy_menu')]);
  }

  await ctx.reply(profileText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(inlineButtons)
  });
}

// Callback for getting VPN key
bot.action('get_key', async (ctx) => {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);

  if (!activeSub) {
    return ctx.answerCbQuery('У вас нет активного доступа!', { show_alert: true });
  }

  await ctx.answerCbQuery();
  
  const keyText = `
🔑 <b>Ваш персональный ключ доступа к Knight VPN (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её в буфер обмена.</i>

⚙️ <b>Быстрая настройка через Happ (рекомендуется):</b>
1. Установите приложение <b>Happ</b> (ссылки для скачивания в разделе «⚙️ Инструкция по авторизации»)
2. Скопируйте вашу ссылку подписки выше
3. Откройте приложение, нажмите значок <b>➕</b> в верхнем правом углу (или кнопку импорта)
4. Выберите <b>«Добавить из буфера обмена»</b>
5. Нажмите кнопку подключения в центре экрана

<i>Если ваше приложение не поддерживает ссылки для подписки, вы можете получить статический ключ (VLESS) по кнопке ниже.</i>
  `;

  const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('⚡️ Установить ключ в Happ', autoImportRedirectUrl)],
    [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')]
  ]);

  await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
});

// Callback for getting static VLESS key
bot.action('get_static_key', async (ctx) => {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);

  if (!activeSub) {
    return ctx.answerCbQuery('У вас нет активного доступа!', { show_alert: true });
  }

  await ctx.answerCbQuery();

  const keyText = `
🔑 <b>Ваш статический ключ доступа (VLESS):</b>
<code>${activeSub.connection_url}</code>

<i>Нажмите на ключ выше, чтобы скопировать его в буфер обмена.</i>

⚠️ <i>Используйте этот статический ключ только в том случае, если ваше приложение-клиент (например, v2rayNG или v2rayN) не поддерживает ссылки подписок. Для автоматического обновления конфигурации и удобного просмотра срока действия подписки рекомендуем использовать приложение Happ со ссылкой для подписки.</i>
  `;

  await ctx.reply(keyText, { parse_mode: 'HTML' });
});


// Callback for activating trial
bot.action('activate_trial', async (ctx) => {
  const tgId = ctx.from.id;
  const user = await db.getUser(tgId);

  if (user && user.trial_used) {
    return ctx.answerCbQuery('Вы уже использовали пробный доступ!', { show_alert: true });
  }

  await ctx.answerCbQuery('Активируем тест...');
  await ctx.reply('⏳ Секунду, генерируем персональный ключ доступа...');

  try {
    const email = `vpn_user_${tgId}`;
    // Add client to 3x-ui
    const client = await xuiApi.addClient(email);

    if (client.error && !xuiApi.mockMode) {
      throw new Error(client.error);
    }

    // Save subscription in DB
    await db.createSubscription(
      tgId,
      client.email,
      client.uuid,
      client.connectionUrl,
      PLANS.trial.name,
      PLANS.trial.days
    );

    // Mark trial as used
    await db.markTrialUsed(tgId);

    const keyText = `
🎉 <b>Пробный доступ успешно активирован!</b>

Доступ к Knight VPN предоставлен на 3 дня.
🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
    `;
    const autoImportRedirectUrl = `${config.SUB_SERVER_URL}/import/${client.uuid}`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('⚡️ Установить ключ в Happ', autoImportRedirectUrl)],
      [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')]
    ]);
    await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    console.error('Trial activation error:', error);
    await ctx.reply('❌ Произошла ошибка при создании ключа доступа. Пожалуйста, обратитесь в поддержку.');
  }
});

// Handler for "💳 Оформить доступ" or "buy_menu" callback
bot.hears('💳 Оформить доступ', async (ctx) => {
  await showBuyMenu(ctx);
});

bot.action('buy_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await showBuyMenu(ctx);
});

bot.action('profile_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await showProfile(ctx);
});

async function showBuyMenu(ctx) {
  const plansText = `
💳 <b>Выберите длительность подписки Knight VPN:</b>

• <b>1 месяц подписки</b> — 150 ₽
• <b>3 месяца подписки</b> — 400 ₽ <i>(выгода 50 ₽)</i>
• <b>6 месяцев подписки</b> — 750 ₽ <i>(выгода 150 ₽)</i>

<i>Подписка активируется автоматически после подтверждения транзакции.</i>
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('1 месяц — 150 ₽', 'buy_1month')],
    [Markup.button.callback('3 месяца — 400 ₽', 'buy_3months')],
    [Markup.button.callback('6 месяцев — 750 ₽', 'buy_6months')],
  ]);

  await ctx.reply(plansText, {
    parse_mode: 'HTML',
    ...keyboard
  });
}

// Payment generation callbacks
const buyPlanAction = (planId) => async (ctx) => {
  const tgId = ctx.from.id;
  const plan = PLANS[planId];
  
  if (!plan) return ctx.answerCbQuery('Неверный тариф');

  // Fallback to manual payment if YOOKASSA_TOKEN is not set
  if (!config.YOOKASSA_TOKEN || config.YOOKASSA_TOKEN === 'YOUR_YOOKASSA_PROVIDER_TOKEN') {
    await ctx.answerCbQuery();
    const manualPaymentText = `
💳 <b>Реквизиты для оплаты доступа «${plan.name}»:</b>

• <b>Сумма к оплате:</b> <code>${plan.price} ₽</code>
• <b>Способ оплаты:</b> Перевод на карту или СБП
• <b>Реквизиты:</b> <code>[Здесь будут указаны ваши реквизиты]</code>

После оплаты, пожалуйста, пришлите скриншот чека в поддержку: @alexs_vpn_admin <i>(замените ник в src/bot.js на ваш)</i>.

После подтверждения администратор сразу активирует вашу подписку!
    `;
    return ctx.reply(manualPaymentText, { parse_mode: 'HTML' });
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
    
    // Send invoice
    await ctx.replyWithInvoice(
      invoice.title,
      invoice.description,
      invoice.payload,
      invoice.provider_token,
      invoice.currency,
      invoice.prices,
      {
        start_parameter: invoice.start_parameter
      }
    );
  } catch (error) {
    console.error('Invoice creation error:', error);
    await ctx.reply('❌ Ошибка при выставлении счета. Возможно, платежный провайдер временно недоступен. Свяжитесь с поддержкой для ручной оплаты.');
  }
};

bot.action('buy_1month', buyPlanAction('1month'));
bot.action('buy_3months', buyPlanAction('3months'));
bot.action('buy_6months', buyPlanAction('6months'));

// --- TELEGRAM PAYMENTS HANDLERS ---

// 1. PreCheckout - answer within 10 seconds
bot.on('pre_checkout_query', async (ctx) => {
  const preCheckoutQueryId = ctx.preCheckoutQuery.id;
  const paymentId = ctx.preCheckoutQuery.invoice_payload;
  
  console.log(`💳 PreCheckout Query received for: ${paymentId}`);
  
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    console.error('PreCheckout error:', error);
    await ctx.answerPreCheckoutQuery(false, 'Произошла ошибка при обработке заказа. Пожалуйста, попробуйте еще раз.');
  }
});

// 2. SuccessfulPayment
bot.on('successful_payment', async (ctx) => {
  const paymentInfo = ctx.message.successful_payment;
  const paymentId = paymentInfo.invoice_payload;
  const tgId = ctx.from.id;

  console.log(`✅ Successful Payment received: ${paymentId} from user ${tgId}`);

  try {
    // Complete payment in DB
    const dbPayment = await db.completePayment(paymentId);
    if (!dbPayment) {
      console.error(`Warning: payment ${paymentId} was completed but not found in DB.`);
    }

    const planId = dbPayment ? dbPayment.plan_id : '1month'; // Fallback to 1 month if not found
    const plan = PLANS[planId] || PLANS['1month'];

    // Check if user already has an active subscription
    const activeSub = await db.getActiveSubscription(tgId);
    let updatedSub;

    if (activeSub) {
      // Extend existing subscription
      updatedSub = await db.extendSubscription(tgId, plan.days);
      
      // Since it's active now, we add it back. If it's a real panel, it will restore access.
      await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid);

      await ctx.reply(`
🎉 <b>Оплата успешно получена!</b>

Ваша подписка Knight VPN продлена на <b>${plan.days} дней</b>.
Новая дата окончания (МСК): <code>${new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU')}</code>

Ваш персональный ключ доступа остается прежним!
      `, { parse_mode: 'HTML' });
    } else {
      // Create a brand new subscription (or reuse details if they have an expired one)
      const user = await db.getUser(tgId);
      const email = `vpn_user_${tgId}`;
      let uuid = crypto.randomUUID();
      
      // Let's check if they have an expired subscription in DB so we can reuse UUID
      const expiredSub = await db.getSubscriptionByEmail(email);
      if (expiredSub) {
        uuid = expiredSub.client_uuid;
      }

      // Add to 3x-ui
      const client = await xuiApi.addClient(email, uuid);
      
      if (client.error && !xuiApi.mockMode) {
        console.error('3x-ui API Error during payment registration:', client.error);
      }

      // Create new active subscription
      updatedSub = await db.createSubscription(
        tgId,
        client.email,
        client.uuid,
        client.connectionUrl,
        plan.name,
        plan.days
      );

      const keyText = `
🎉 <b>Оплата успешно получена! Подписка Knight VPN активирована!</b>

Спасибо за покупку! Доступ предоставлен на <b>${plan.days} дней</b>.
Действует до (МСК): <code>${new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU')}</code>

🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
      `;
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

// Function to send/edit OS selection menu
async function sendInstructionsMenu(ctx, isCallback = false) {
  const instructionsText = `
⚙️ <b>Инструкция по подключению к Knight VPN</b>

Выберите вашу операционную систему / устройство для настройки подключения:
  `;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🍏 iOS (iPhone/iPad)', 'inst_ios'),
      Markup.button.callback('🤖 Android', 'inst_android')
    ],
    [
      Markup.button.callback('💻 Windows', 'inst_windows'),
      Markup.button.callback('🍎 macOS', 'inst_macos')
    ]
  ]);

  if (isCallback) {
    try {
      await ctx.editMessageText(instructionsText, {
        parse_mode: 'HTML',
        ...keyboard
      });
    } catch (err) {
      // Fallback if message edit fails
      await ctx.reply(instructionsText, {
        parse_mode: 'HTML',
        ...keyboard
      });
    }
  } else {
    await ctx.reply(instructionsText, {
      parse_mode: 'HTML',
      ...keyboard
    });
  }
}

// Handler for "⚙️ Инструкция по авторизации"
bot.hears('⚙️ Инструкция по авторизации', async (ctx) => {
  await sendInstructionsMenu(ctx, false);
});

// Callback for back button
bot.action('inst_back', async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch (err) {
    console.warn('⚠️ Callback query answer failed:', err.message);
  }
  await sendInstructionsMenu(ctx, true);
});

// Callback for getting key inside instructions flow
bot.action('get_key_from_inst', async (ctx) => {
  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);

  if (!activeSub) {
    try {
      return await ctx.answerCbQuery('У вас нет активного доступа!', { show_alert: true });
    } catch (err) {
      return ctx.reply('❌ У вас нет активного доступа!');
    }
  }

  try {
    await ctx.answerCbQuery();
  } catch (err) {
    console.warn('⚠️ Callback query answer failed:', err.message);
  }

  const keyText = `
🔑 <b>Ваш персональный ключ доступа к Knight VPN (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её в буфер обмена.</i>

⚙️ <b>Быстрая настройка через Happ:</b>
1️⃣ Скопируйте ссылку подписки выше
2️⃣ Откройте приложение <b>Happ</b>
3️⃣ Нажмите значок <b>➕</b> в верхнем правом углу (или кнопку импорта)
4️⃣ Выберите <b>«Добавить из буфера обмена»</b>
5️⃣ Нажмите кнопку подключения в центре экрана
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')],
    [Markup.button.callback('🔙 Назад к инструкции', 'inst_back')]
  ]);

  await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
});

// Instruction details callbacks
const showInstruction = (os) => async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch (err) {
    console.warn('⚠️ Callback query answer failed:', err.message);
  }

  const tgId = ctx.from.id;
  const activeSub = await db.getActiveSubscription(tgId);
  const subUrl = activeSub ? `${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}` : null;
  const autoImportUrl = subUrl ? `sing-box://import-remote?url=${encodeURIComponent(subUrl)}` : null;
  const autoImportRedirectUrl = activeSub ? `${config.SUB_SERVER_URL}/import/${activeSub.client_uuid}` : null;

  let text = '';
  let inlineKeyboard = [];
  
  if (os === 'ios') {
    text = `
🍏 <b>Подключение на iOS (iPhone, iPad)</b>

1️⃣ <b>Установите приложение Happ:</b>
Нажмите кнопку <b>«Скачать из App Store»</b> ниже.

2️⃣ <b>Добавьте подписку:</b>
${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):
👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>

<i>Если авто-импорт не сработал:</i>
• Скопируйте ссылку подписки вручную из раздела «👤 Мой профиль».
• Откройте <b>Happ</b>, нажмите значок <b>➕</b> в верхнем правом углу (или кнопку импорта) и выберите <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>
Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}

3️⃣ <b>Подключитесь:</b>
Нажмите круглую кнопку в центре экрана приложения для запуска VPN. Разрешите системе добавить конфигурацию VPN.

━━━━━━━━━━━━━━━━━━
<i>Приложение будет автоматически обновлять конфигурации.</i>
    `;
    inlineKeyboard.push([Markup.button.url('📥 Скачать из App Store', 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215')]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([Markup.button.url('⚡️ Авто-импорт в Happ', autoImportRedirectUrl)]);
    }
    inlineKeyboard.push([
      Markup.button.callback('🔑 Получить ключ', 'get_key_from_inst'),
      Markup.button.callback('🔙 Назад', 'inst_back')
    ]);

  } else if (os === 'android') {
    text = `
🤖 <b>Подключение на Android</b>

1️⃣ <b>Установите приложение Sing-box (совместимое с Happ):</b>
Установите из <b>Google Play</b> или скачайте <b>APK-файл</b> напрямую с GitHub по кнопкам ниже.

2️⃣ <b>Добавьте подписку:</b>
${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):
👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>

<i>Если авто-импорт не сработал:</i>
• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».
• В приложении нажмите значок <b>➕</b> ➡️ <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>
Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}

3️⃣ <b>Подключитесь:</b>
Нажмите кнопку включения в центре экрана приложения и подтвердите создание VPN-подключения в системном запросе Android.

━━━━━━━━━━━━━━━━━━
<i>Подходит для любых Android-смартфонов, планшетов и Android TV.</i>
    `;
    inlineKeyboard.push([
      Markup.button.url('📥 Google Play', 'https://play.google.com/store/apps/details?id=io.nekohasekai.sfa'),
      Markup.button.url('📥 APK с GitHub', 'https://github.com/SagerNet/sing-box/releases')
    ]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([Markup.button.url('⚡️ Авто-импорт в Happ', autoImportRedirectUrl)]);
    }
    inlineKeyboard.push([
      Markup.button.callback('🔑 Получить ключ', 'get_key_from_inst'),
      Markup.button.callback('🔙 Назад', 'inst_back')
    ]);

  } else if (os === 'windows') {
    text = `
💻 <b>Подключение на Windows</b>

1️⃣ <b>Скачайте Sing-box для Windows (совместимый с Happ):</b>
Нажмите кнопку <b>«📥 Скачать для Windows»</b> ниже для перехода к релизам программы.

2️⃣ <b>Добавьте подписку:</b>
${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):
👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>

<i>Если авто-импорт не сработал:</i>
• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».
• В программе добавьте новый профиль из буфера обмена.` : `⚠️ <b>У вас нет активной подписки!</b>
Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}

3️⃣ <b>Подключитесь:</b>
Запустите созданный профиль в программе.

━━━━━━━━━━━━━━━━━━
<i>При первом запуске брандмауэр Windows может запросить разрешение — подтвердите его.</i>
    `;
    inlineKeyboard.push([Markup.button.url('📥 Скачать для Windows (.exe)', 'https://github.com/SagerNet/sing-box/releases')]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([Markup.button.url('⚡️ Авто-импорт в Happ', autoImportRedirectUrl)]);
    }
    inlineKeyboard.push([
      Markup.button.callback('🔑 Получить ключ', 'get_key_from_inst'),
      Markup.button.callback('🔙 Назад', 'inst_back')
    ]);

  } else if (os === 'macos') {
    text = `
🍎 <b>Подключение на macOS</b>

1️⃣ <b>Установите приложение Happ:</b>
Скачайте из App Store по кнопке ниже.

2️⃣ <b>Добавьте подписку:</b>
${activeSub ? `Нажмите на кнопку <b>«⚡️ Авто-импорт в Happ»</b> ниже (или на текстовую ссылку):
👉 <a href="${autoImportUrl}"><b>НАЖМИТЕ ДЛЯ АВТО-ИМПОРТА</b></a>

<i>Если авто-импорт не сработал:</i>
• Скопируйте ссылку подписки вручную через раздел «👤 Мой профиль».
• В программе <b>Happ</b> нажмите значок <b>➕</b> ➡️ <b>«Добавить из буфера обмена»</b>.` : `⚠️ <b>У вас нет активной подписки!</b>
Активируйте тест или оформите подписку в меню 👤 <b>Мой профиль</b>, после чего здесь появится кнопка для автоматического импорта.`}

3️⃣ <b>Подключитесь:</b>
Нажмите кнопку включения в программе для запуска VPN.

━━━━━━━━━━━━━━━━━━
<i>Рекомендуется использовать официальное приложение Happ для автоматического обновления профилей.</i>
    `;
    inlineKeyboard.push([
      Markup.button.url('📥 Скачать из App Store', 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215')
    ]);
    if (autoImportRedirectUrl) {
      inlineKeyboard.push([Markup.button.url('⚡️ Авто-импорт в Happ', autoImportRedirectUrl)]);
    }
    inlineKeyboard.push([
      Markup.button.callback('🔑 Получить ключ', 'get_key_from_inst'),
      Markup.button.callback('🔙 Назад', 'inst_back')
    ]);
  }

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard(inlineKeyboard)
    });
  } catch (err) {
    // Fallback if editMessageText fails
    await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard(inlineKeyboard)
    });
  }
};

bot.action('inst_ios', showInstruction('ios'));
bot.action('inst_android', showInstruction('android'));
bot.action('inst_windows', showInstruction('windows'));
bot.action('inst_macos', showInstruction('macos'));

// Handler for "🆘 Поддержка"
bot.hears('🆘 Поддержка', async (ctx) => {
  const supportText = `
🆘 <b>Служба поддержки Knight VPN</b>

Если у вас возникли вопросы по оплате, настройке или работе VPN — напишите администратору:

👨‍💻 <b>Контакты администратора:</b> @alexs_vpn_admin

Опишите вашу проблему, указав ваш ID: <code>${ctx.from.id}</code>
  `;

  await ctx.reply(supportText, { parse_mode: 'HTML' });
});

// --- ADMIN PANEL HANDLERS ---

bot.hears('👑 Админ-панель', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await showAdminPanel(ctx);
});

async function showAdminPanel(ctx) {
  const stats = await db.getStats();
  const adminText = `
👑 <b>Панель администратора:</b>

📊 <b>Статистика:</b>
• Всего пользователей: <code>${stats.totalUsers}</code>
• Активных участников: <code>${stats.activeSubscribers}</code>
• Всего заработано: <code>${stats.totalEarnings} ₽</code>

📝 <b>Команды управления:</b>
• <code>/give [id] [days]</code> — Предоставить/продлить доступ пользователю на X дней.
  Пример: <code>/give 123456789 30</code>
• <code>/broadcast [текст]</code> — Отправить сообщение всем участникам.
  Пример: <code>/broadcast Внимание! Проводятся технические работы.</code>
  `;

  await ctx.reply(adminText, { parse_mode: 'HTML' });
}

// Command /give [id] [days]
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
      await xuiApi.addClient(activeSub.client_email, activeSub.client_uuid);
    } else {
      const email = `vpn_user_${targetId}`;
      let uuid = crypto.randomUUID();
      
      const expiredSub = await db.getSubscriptionByEmail(email);
      if (expiredSub) {
        uuid = expiredSub.client_uuid;
      }

      const client = await xuiApi.addClient(email, uuid);
      updatedSub = await db.createSubscription(
        targetId,
        client.email,
        client.uuid,
        client.connectionUrl,
        'Выдано админом',
        days
      );
    }

    const expiryDate = new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU');

    // Notify admin
    await ctx.reply(`✅ Пользователю <code>${targetId}</code> успешно выдан доступ на <b>${days} дней</b>.\nНовая дата окончания: <code>${expiryDate}</code>`, { parse_mode: 'HTML' });

    // Notify user
    try {
      const userKeyText = `
🎁 <b>Администратор предоставил/продлил вам подписку Knight VPN на ${days} дней!</b>

Новая дата окончания (МСК): <code>${expiryDate}</code>

🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${updatedSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
      `;
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

// Command /broadcast [message]
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const text = ctx.message.text.substring(11).trim(); // Remove "/broadcast "
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

// Global error handling to prevent crash on Telegram API errors
bot.catch((err, ctx) => {
  console.error(`❌ Telegraf caught an error for update ${ctx?.update?.update_id}:`, err);
});

export default bot;
