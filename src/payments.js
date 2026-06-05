import config from './config.js';

// Define subscription plans
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Пробный VPN (3 дня)',
    price: 0,
    days: 3,
    description: 'Тестовый доступ к Knight VPN на 3 дня. Доступен только один раз.'
  },
  '1month': {
    id: '1month',
    name: '1 месяц подписки',
    price: 150,
    days: 30,
    description: 'Подписка на быстрый и безопасный Knight VPN на 30 дней.'
  },
  '3months': {
    id: '3months',
    name: '3 месяца подписки',
    price: 400,
    days: 90,
    description: 'Подписка на быстрый и безопасный Knight VPN на 90 дней со скидкой.'
  },
  '6months': {
    id: '6months',
    name: '6 месяцев подписки',
    price: 750,
    days: 180,
    description: 'Подписка на быстрый и безопасный Knight VPN на 180 дней с максимальной выгодой.'
  }
};

/**
 * Creates Telegram invoice object for replyWithInvoice
 * @param {string} planId
 * @param {number} userId
 * @returns {object} Telegraf invoice parameters
 */
export function createInvoice(planId, userId) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('Invalid plan ID');

  // Payload is passed back in preCheckoutQuery and successfulPayment
  const payload = JSON.stringify({
    userId,
    planId,
    timestamp: Date.now()
  });

  return {
    title: `Подписка Knight VPN — ${plan.name}`,
    description: plan.description,
    payload: payload,
    provider_token: config.YOOKASSA_TOKEN,
    currency: 'RUB',
    prices: [
      { label: plan.name, amount: plan.price * 100 } // Amount in smallest currency units (cents/kopecks)
    ],
    start_parameter: `knight_vpn_sub_${planId}`,
  };
}
