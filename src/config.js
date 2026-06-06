import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const botToken = process.env.BOT_TOKEN;
const adminTgIds = (process.env.ADMIN_TG_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

const yookassaToken = process.env.YOOKASSA_TOKEN;

const xuiUrl = process.env.XUI_URL;
const xuiUsername = process.env.XUI_USERNAME;
const xuiPassword = process.env.XUI_PASSWORD;
const xuiInboundId = parseInt(process.env.XUI_INBOUND_ID || '1', 10);
const xuiLimitIp = parseInt(process.env.XUI_LIMIT_IP || '1', 10);
const mockXui = process.env.MOCK_XUI === 'true';

const databaseFile = process.env.DATABASE_FILE || './database.db';

const subServerUrl = process.env.SUB_SERVER_URL || 'http://your-server-ip:3000';
const subPort = parseInt(process.env.SUB_PORT || '3000', 10);

// Validation and warnings
if (!botToken || botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
  console.warn('⚠️ BOT_TOKEN is not set correctly in your .env file!');
}

if (!yookassaToken || yookassaToken === 'YOUR_YOOKASSA_PROVIDER_TOKEN') {
  console.warn('⚠️ YOOKASSA_TOKEN is not set. Payments will fail unless in mock or admin mode.');
}

if (mockXui) {
  console.log('ℹ️ Running in MOCK 3x-ui mode. Dummy VPN keys will be generated without calling the real panel.');
}

const botBanner = process.env.BOT_BANNER || 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80';

export default {
  BOT_TOKEN: botToken,
  ADMIN_TG_IDS: adminTgIds,
  YOOKASSA_TOKEN: yookassaToken,
  XUI_URL: xuiUrl,
  XUI_USERNAME: xuiUsername,
  XUI_PASSWORD: xuiPassword,
  XUI_INBOUND_ID: xuiInboundId,
  XUI_LIMIT_IP: xuiLimitIp,
  MOCK_XUI: mockXui,
  DATABASE_FILE: databaseFile,
  SUB_SERVER_URL: subServerUrl,
  SUB_PORT: subPort,
  BOT_BANNER: botBanner,
};
