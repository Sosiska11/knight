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

Добро пожаловать на закрытую информационную ИТ-платформу <b>Knight Space</b>! 🚀

📚 <b>В нашем закрытом клубе вы найдете:</b>
• Подробные обучающие материалы по информационной безопасности
• Пошаговые гайды по компьютерной грамотности
• Инструкции по безопасной настройке домашних сетей
• Защита персональных данных в сети Интернет

🎁 Для новых участников доступен <b>бесплатный пробный доступ на 3 дня</b>!
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
    profileText += `📥 Ваш персональный ключ доступа к ИТ-платформе готов. Нажмите на кнопку ниже, чтобы получить его.`;

    inlineButtons.push([Markup.button.callback('🔑 Получить ключ доступа', 'get_key')]);
    inlineButtons.push([Markup.button.callback('🔄 Продлить доступ', 'buy_menu')]);
  } else {
    profileText += `• <b>Статус доступа:</b> ❌ Неактивен\n\n`;
    
    if (user && !user.trial_used) {
      profileText += `🎁 Вам доступен бесплатный пробный доступ на 3 дня!`;
      inlineButtons.push([Markup.button.callback('🎁 Активировать тест (3 дня)', 'activate_trial')]);
    } else {
      profileText += `Для ознакомления с материалами оформите доступ.`;
    }
    
    inlineButtons.push([Markup.button.callback('💳 Оформить доступ', 'buy_menu')]);
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
🔑 <b>Ваш персональный ключ доступа к ИТ-платформе Knight Space (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${activeSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её в буфер обмена.</i>

⚙️ <b>Быстрая настройка через Hiddify (рекомендуется):</b>
1. Установите приложение <b>Hiddify</b> (ссылки для скачивания в разделе «⚙️ Инструкция по авторизации»)
2. Скопируйте вашу ссылку подписки выше
3. Откройте приложение, нажмите <b>«Новый профиль»</b> (или ➕ в правом верхнем углу)
4. Выберите <b>«Добавить из буфера обмена»</b>
5. Нажмите большую кнопку подключения в центре экрана

<i>Если ваше приложение не поддерживает ссылки для подписки, вы можете получить статический ключ (VLESS) по кнопке ниже.</i>
  `;

  const keyboard = Markup.inlineKeyboard([
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

⚠️ <i>Используйте этот статический ключ только в том случае, если ваше приложение-клиент (например, v2rayNG или v2rayN) не поддерживает ссылки подписок. Для автоматического обновления конфигурации и удобного просмотра срока действия подписки рекомендуем использовать приложение Hiddify со ссылкой для подписки.</i>
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

Доступ к ИТ-платформе предоставлен на 3 дня.
🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
    `;
    const keyboard = Markup.inlineKeyboard([
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
💳 <b>Выберите длительность доступа к материалам IT-платформы:</b>

• <b>1 месяц доступа</b> — 150 ₽
• <b>3 месяца доступа</b> — 400 ₽ <i>(выгода 50 ₽)</i>
• <b>6 месяцев доступа</b> — 750 ₽ <i>(выгода 150 ₽)</i>

<i>Доступ активируется автоматически после подтверждения транзакции.</i>
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

После подтверждения администратор сразу активирует ваш доступ к платформе!
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
      invoice.start_parameter,
      invoice.currency,
      invoice.prices,
      {}
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

Ваш доступ к материалам продлен на <b>${plan.days} дней</b>.
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
🎉 <b>Оплата успешно получена! Доступ к ИТ-платформе Knight Space активирован!</b>

Спасибо за покупку! Доступ предоставлен на <b>${plan.days} дней</b>.
Действует до (МСК): <code>${new Date(updatedSub.expires_at.replace(' ', 'T') + 'Z').toLocaleString('ru-RU')}</code>

🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${client.uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
      `;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Получить статический ключ (VLESS)', 'get_static_key')]
      ]);
      await ctx.reply(keyText, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    console.error('Successful payment processing error:', error);
    await ctx.reply('❌ Оплата прошла, но произошла ошибка при активации доступа на сервере. Пожалуйста, перешлите это сообщение администратору для ручной выдачи доступа.');
  }
});

// Handler for "⚙️ Инструкция по авторизации"
bot.hears('⚙️ Инструкция по авторизации', async (ctx) => {
  const instructionsText = `
⚙️ <b>Инструкция по авторизации на ИТ-платформе Knight Space:</b>

Выберите вашу операционную систему для настройки клиента авторизации:
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🍏 iOS (iPhone/iPad)', 'inst_ios')],
    [Markup.button.callback('🤖 Android', 'inst_android')],
    [Markup.button.callback('💻 Windows', 'inst_windows')],
    [Markup.button.callback('🍎 macOS', 'inst_macos')],
  ]);

  await ctx.reply(instructionsText, {
    parse_mode: 'HTML',
    ...keyboard
  });
});

// Instruction details callbacks
const showInstruction = (os) => async (ctx) => {
  await ctx.answerCbQuery();
  let text = '';
  
  if (os === 'ios') {
    text = `
🍏 <b>Инструкция для iOS (iPhone, iPad):</b>

1️⃣ Установите приложение <b>Hiddify</b>:
   👉 <a href="https://apps.apple.com/app/hiddify/id6477388749">Установить Hiddify из App Store</a>
2️⃣ Скопируйте ваш персональный <b>ключ доступа (подписку)</b> из бота (раздел 👤 <b>Мой профиль</b> -> 🔑 <b>Получить ключ доступа</b>).
3️⃣ Откройте приложение Hiddify:
   • Нажмите кнопку <b>«Новый профиль»</b> (или значок ➕ в правом верхнем углу).
   • Выберите пункт <b>«Добавить из буфера обмена»</b> (Add from Clipboard).
4️⃣ Нажмите большую круглую кнопку в центре экрана для активации безопасного подключения.
    `;
  } else if (os === 'android') {
    text = `
🤖 <b>Инструкция для Android:</b>

1️⃣ Установите приложение <b>Hiddify</b>:
   👉 <a href="https://play.google.com/store/apps/details?id=app.hiddify.com">Установить Hiddify из Google Play</a>
   👉 <a href="https://github.com/hiddify/hiddify-next/releases">Скачать APK напрямую с GitHub</a>
2️⃣ Скопируйте ваш персональный <b>ключ доступа (подписку)</b> из бота (раздел 👤 <b>Мой профиль</b> -> 🔑 <b>Получить ключ доступа</b>).
3️⃣ Откройте приложение Hiddify:
   • Нажмите кнопку <b>«Новый профиль»</b> (или значок ➕ в правом верхнем углу).
   • Выберите пункт <b>«Добавить из буфера обмена»</b> (Add from Clipboard).
4️⃣ Нажмите большую круглую кнопку в центре экрана и подтвердите создание VPN-подключения в системе.
    `;
  } else if (os === 'windows') {
    text = `
💻 <b>Инструкция для Windows:</b>

1️⃣ Скачайте и установите программу <b>Hiddify</b>:
   👉 <a href="https://github.com/hiddify/hiddify-next/releases">Скачать Hiddify для Windows с GitHub</a>
   <i>(Рекомендуется скачать файл с расширением .setup.exe)</i>
2️⃣ Скопируйте ваш персональный <b>ключ доступа (подписку)</b> из бота.
3️⃣ Откройте Hiddify:
   • Нажмите кнопку <b>«Новый профиль»</b> (или значок ➕ в правом верхнем углу).
   • Нажмите кнопку <b>«Добавить из буфера обмена»</b> (Add from Clipboard).
4️⃣ Нажмите большую круглую кнопку подключения в центре программы.
    `;
  } else if (os === 'macos') {
    text = `
🍎 <b>Инструкция для macOS:</b>

1️⃣ Установите программу <b>Hiddify</b>:
   👉 <a href="https://apps.apple.com/app/hiddify/id6477388749">Установить Hiddify из App Store</a>
   👉 <a href="https://github.com/hiddify/hiddify-next/releases">Скачать для macOS с GitHub</a>
2️⃣ Скопируйте ваш персональный <b>ключ доступа (подписку)</b> из бота.
3️⃣ Откройте Hiddify:
   • Нажмите кнопку <b>«Новый профиль»</b> (или значок ➕ в правом верхнем углу).
   • Выберите <b>«Добавить из буфера обмена»</b> (Add from Clipboard).
4️⃣ Нажмите большую круглую кнопку подключения в центре.
    `;
  }

  await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true });
};

bot.action('inst_ios', showInstruction('ios'));
bot.action('inst_android', showInstruction('android'));
bot.action('inst_windows', showInstruction('windows'));
bot.action('inst_macos', showInstruction('macos'));

// Handler for "🆘 Поддержка"
bot.hears('🆘 Поддержка', async (ctx) => {
  const supportText = `
🆘 <b>Служба поддержки Knight Space</b>

Если у вас возникли вопросы по оплате, авторизации или доступу к обучающим материалам — напишите администратору:

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
  Пример: <code>/broadcast Внимание! Проводятся технические работы на платформе.</code>
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
🎁 <b>Администратор предоставил вам доступ к ИТ-платформе Knight Space на ${days} дней!</b>

Новая дата окончания (МСК): <code>${expiryDate}</code>

🔑 <b>Ваш персональный ключ доступа (подписка):</b>
<code>${config.SUB_SERVER_URL}/sub/${updatedSub.client_uuid}</code>

<i>Нажмите на ссылку выше, чтобы скопировать её. Подробные инструкции по настройке находятся в разделе «⚙️ Инструкция по авторизации».</i>
      `;
      const keyboard = Markup.inlineKeyboard([
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

export default bot;
