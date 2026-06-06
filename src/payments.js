import config from './config.js';

// Define subscription plans with duration and device limits
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Пробный (1 устр. / 3 дня)',
    price: 0,
    days: 3,
    devices: 1,
    description: 'Тестовый доступ к Knight VPN на 3 дня (1 устройство).'
  },
  '1month_1': {
    id: '1month_1',
    name: '1 месяц (1 устр.)',
    price: 150,
    days: 30,
    devices: 1,
    description: 'Подписка Knight VPN на 30 дней для 1 устройства.'
  },
  '1month_3': {
    id: '1month_3',
    name: '1 месяц (3 устр.)',
    price: 300,
    days: 30,
    devices: 3,
    description: 'Подписка Knight VPN на 30 дней для 3 устройств.'
  },
  '1month_5': {
    id: '1month_5',
    name: '1 месяц (5 устр.)',
    price: 450,
    days: 30,
    devices: 5,
    description: 'Подписка Knight VPN на 30  дней для 5 устройств.'
  },
  '3months_1': {
    id: '3months_1',
    name: '3 месяца (1 устр.)',
    price: 400,
    days: 90,
    devices: 1,
    description: 'Подписка Knight VPN на 90 дней для 1 устройства.'
  },
  '3months_3': {
    id: '3months_3',
    name: '3 месяца (3 устр.)',
    price: 800,
    days: 90,
    devices: 3,
    description: 'Подписка Knight VPN на 90 дней для 3 устройств.'
  },
  '3months_5': {
    id: '3months_5',
    name: '3 месяца (5 устр.)',
    price: 1200,
    days: 90,
    devices: 5,
    description: 'Подписка Knight VPN на 90 дней для 5 устройств.'
  },
  '6months_1': {
    id: '6months_1',
    name: '6 месяцев (1 устр.)',
    price: 750,
    days: 180,
    devices: 1,
    description: 'Подписка Knight VPN на 180 дней для 1 устройства.'
  },
  '6months_3': {
    id: '6months_3',
    name: '6 месяцев (3 устр.)',
    price: 1500,
    days: 180,
    devices: 3,
    description: 'Подписка Knight VPN на 180 дней для 3 устройств.'
  },
  '6months_5': {
    id: '6months_5',
    name: '6 месяцев (5 устр.)',
    price: 2200,
    days: 180,
    devices: 5,
    description: 'Подписка Knight VPN на 180 дней для 5 устройств.'
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
