import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

const supportChatId = process.env.SUPPORT_CHAT_ID && !isNaN(parseInt(process.env.SUPPORT_CHAT_ID.trim(), 10))
  ? parseInt(process.env.SUPPORT_CHAT_ID.trim(), 10)
  : null;


const xuiUrl = process.env.XUI_URL;
const xuiUsername = process.env.XUI_USERNAME;
const xuiPassword = process.env.XUI_PASSWORD;
const xuiInboundId = parseInt(process.env.XUI_INBOUND_ID || '1', 10);
const xuiBypassInboundId = process.env.XUI_BYPASS_INBOUND_ID ? parseInt(process.env.XUI_BYPASS_INBOUND_ID, 10) : null;
const xuiCdnInboundId = process.env.XUI_CDN_INBOUND_ID ? parseInt(process.env.XUI_CDN_INBOUND_ID, 10) : null;
const xuiHy2InboundId = process.env.XUI_HY2_INBOUND_ID ? parseInt(process.env.XUI_HY2_INBOUND_ID, 10) : null;
const xuiVlessCdnInboundId = process.env.XUI_VLESS_CDN_INBOUND_ID ? parseInt(process.env.XUI_VLESS_CDN_INBOUND_ID, 10) : null;
const hy2Port = process.env.HY2_PORT ? parseInt(process.env.HY2_PORT, 10) : 46352;
const useCdnBypass = process.env.USE_CDN_BYPASS === 'true';
const cdnDomain = process.env.CDN_DOMAIN || '';
const rawCdnPath = process.env.CDN_PATH || '/knight-down';
const cdnPath = rawCdnPath.endsWith('/') ? rawCdnPath : `${rawCdnPath}/`;
const cdnPort = parseInt(process.env.CDN_PORT || '443', 10);
const rawXhttpPath = process.env.XHTTP_PATH || '/knight-down';
const xhttpPath = rawXhttpPath.replace(/\/+$/, '') || '/knight-down';
const xhttpMode = process.env.XHTTP_MODE || 'packet-up';
const xuiBypassLimitGb = parseInt(process.env.XUI_BYPASS_LIMIT_GB || '0', 10);
const xuiLimitIp = parseInt(process.env.XUI_LIMIT_IP || '1', 10);
const mockXui = process.env.MOCK_XUI === 'true';

const databaseFile = process.env.DATABASE_FILE || './database.db';

const subServerUrl = process.env.SUB_SERVER_URL || 'http://your-server-ip:3000';
const subPort = parseInt(process.env.SUB_PORT || '3000', 10);
const sslCertPath = process.env.SSL_CERT_PATH || '';
const sslKeyPath = process.env.SSL_KEY_PATH || '';

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

let botBanner = process.env.BOT_BANNER || 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80';

// Resolve botBanner if it is a local file path
if (typeof botBanner === 'string' && !botBanner.startsWith('http://') && !botBanner.startsWith('https://')) {
  const projectRoot = path.join(__dirname, '..');
  
  // Try resolving:
  // 1. Direct path from process.cwd()
  let resolvedPath = path.resolve(botBanner);
  
  // 2. Relative to project root
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = path.resolve(projectRoot, botBanner);
  }
  
  // 3. Relative to src/
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = path.resolve(projectRoot, 'src', botBanner);
  }
  
  if (fs.existsSync(resolvedPath)) {
    console.log(`🖼 Found local banner image at: ${resolvedPath}`);
    botBanner = { source: resolvedPath };
  } else {
    console.warn(`⚠️ BOT_BANNER file not found at: ${botBanner}. Falling back to default URL.`);
    botBanner = 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80';
  }
}

export default {
  BOT_TOKEN: botToken,
  ADMIN_TG_IDS: adminTgIds,
  YOOKASSA_TOKEN: yookassaToken,
  SUPPORT_CHAT_ID: supportChatId,
  XUI_URL: xuiUrl,
  XUI_USERNAME: xuiUsername,
  XUI_PASSWORD: xuiPassword,
  XUI_INBOUND_ID: xuiInboundId,
  XUI_BYPASS_INBOUND_ID: xuiBypassInboundId,
  XUI_CDN_INBOUND_ID: xuiCdnInboundId,
  XUI_HY2_INBOUND_ID: xuiHy2InboundId,
  XUI_VLESS_CDN_INBOUND_ID: xuiVlessCdnInboundId,
  HY2_PORT: hy2Port,
  USE_CDN_BYPASS: useCdnBypass,
  CDN_DOMAIN: cdnDomain,
  CDN_PATH: cdnPath,
  CDN_PORT: cdnPort,
  XHTTP_PATH: xhttpPath,
  XHTTP_MODE: xhttpMode,
  XUI_BYPASS_LIMIT_GB: xuiBypassLimitGb,
  XUI_LIMIT_IP: xuiLimitIp,
  MOCK_XUI: mockXui,
  DATABASE_FILE: databaseFile,
  SUB_SERVER_URL: subServerUrl,
  SUB_PORT: subPort,
  BOT_BANNER: botBanner,
  SSL_CERT_PATH: sslCertPath,
  SSL_KEY_PATH: sslKeyPath,
};
