import express from 'express';
import axios from 'axios';
import https from 'https';
import http from 'http';
import fs from 'fs';
import * as db from './database.js';
import config from './config.js';
import xuiApi from './xui-api.js';
import { reserveNodes } from './cron.js';
import dns from 'dns';
import crypto from 'crypto';
import bot from './bot.js';

// Simple in-memory rate limiter (no external dependency). Tracks requests per
// IP within a rolling time window. Cleans up stale entries every 10 minutes.
class MemoryRateLimiter {
  constructor({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests, please try again later.' }) {
    this.windowMs = windowMs;
    this.max = max;
    this.message = message;
    this.requests = new Map(); // ip -> [timestamps]
    this.lastCleanup = Date.now();
  }

  middleware() {
    return (req, res, next) => {
      const now = Date.now();
      this.cleanup(now);

      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const timestamps = this.requests.get(ip) || [];

      // Remove timestamps outside the window
      const valid = timestamps.filter(ts => now - ts < this.windowMs);
      if (valid.length >= this.max) {
        res.setHeader('Retry-After', Math.ceil(this.windowMs / 1000));
        return res.status(429).send(this.message);
      }

      valid.push(now);
      this.requests.set(ip, valid);
      next();
    };
  }

  cleanup(now) {
    if (now - this.lastCleanup < 10 * 60 * 1000) return;
    for (const [ip, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(ts => now - ts < this.windowMs);
      if (valid.length === 0) this.requests.delete(ip);
      else this.requests.set(ip, valid);
    }
    this.lastCleanup = now;
  }
}

const app = express();
const PORT = config.SUB_PORT;

// Trust X-Forwarded-For headers when running behind a reverse proxy (nginx,
// Cloudflare, etc.). Enable only if the proxy strips untrusted headers,
// otherwise clients can spoof their IP and bypass the rate limiter.
if (config.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = new MemoryRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(globalLimiter.middleware());

// Stricter limit for subscription endpoints: 60 requests per 15 minutes per IP
const subLimiter = new MemoryRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 });
app.use('/sub/', subLimiter.middleware());
app.use('/import/', subLimiter.middleware());

app.get('/sub/:uuid', async (req, res) => {
  const { uuid } = req.params;
  
  try {
    const sub = await db.getSubscriptionByUuid(uuid);

    if (!sub || sub.status !== 'active') {
      return res.status(404).send('Subscription not found or expired.');
    }

    // Parse expiration date to Unix timestamp (seconds)
    const expireTimestamp = Math.floor(
      new Date(sub.expires_at.replace(' ', 'T') + 'Z').getTime() / 1000
    );

    // Calculate remaining days
    const now = new Date();
    const expireDate = new Date(sub.expires_at.replace(' ', 'T') + 'Z');
    const diffTime = expireDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const daysLeft = diffDays > 0 ? diffDays : 0;

    const botUsername = bot.botInfo?.username || 'knightvpn_rbot';
    const noticeText = `🛡️ Подписка активна (осталось ${daysLeft} дн.)
👤 ID пользователя: ${sub.tg_id || ''}
🚫 Торренты строго запрещены!
⚠️ Не все сервера обхода рабочие.
⚡ Нажмите кнопку пинга (справа от 🔄), чтобы найти рабочий.`;

    const base64Title = 'base64:' + Buffer.from('⚔️ Knight VPN').toString('base64');
    const base64Notice = 'base64:' + Buffer.from(noticeText).toString('base64');

    // Set Headers for Hiddify, Shadowrocket, Sing-box, etc.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('profile-update-interval', '1');
    res.setHeader('profile-title', base64Title);
    res.setHeader('profile-notice', base64Notice);
    res.setHeader('announce', base64Notice);
    res.setHeader('profile-web-page-url', `https://t.me/${botUsername}`);
    res.setHeader('support-url', `https://t.me/${botUsername}`);
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''KnightVPN");
    
    // Shows traffic usage (1 TB total) and expiration date inside Hiddify
    res.setHeader(
      'subscription-userinfo',
      `upload=0; download=0; total=1099511627776; expire=${expireTimestamp}`
    );

    const testMode = req.query.test || ''; // 'main', 'de', 'ru', 'clean' or empty

    // Dynamically override the server name/remark with a beautiful name and flag
    const mainHostMatch = sub.connection_url.match(/@([^:]+):/);
    const mainHost = mainHostMatch ? mainHostMatch[1] : null;

    const baseConnectionUrl = (sub.connection_url || '').replace(/sni=[^&]+/g, 'sni=www.google.com');

    let configsText = '';

    const showMain = !testMode || testMode === 'main' || testMode === 'clean';

    if (showMain) {
      if (!mainHost || !xuiApi.isNodeOffline(mainHost)) {
        const clientUuid = sub.client_uuid;
        const relayIp = '31.76.46.20';

        // 1. Poland VLESS TCP Reality connection URL (Direct, top-priority)
        const polandVless = `vless://${clientUuid}@188.255.163.236:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=dl.google.com&pbk=RWc0hf-pPEhU9h91ly1Dax4oFRSdOGzmtnqMZ6arfj8&fp=chrome&sid=9d&type=tcp#${encodeURIComponent('🇵🇱 Польша')}`;
        configsText += polandVless + '\n';

        // 1b. Poland Hysteria 2 Direct connection URL (UDP, no relay)
        const polandHy2 = `hysteria2://${clientUuid}@188.255.163.236:25000?sni=sub.knight1.space&alpn=h3#${encodeURIComponent('🇵🇱 Польша | Hysteria 2')}`;
        configsText += polandHy2 + '\n';

        // 2. Germany TUIC v5 connection URL (relayed via Finland over QUIC UDP)
        const tuicLink = `tuic://${clientUuid}@${relayIp}:8448?sni=sub.knight1.space&alpn=h3&congestion_control=bbr#${encodeURIComponent('🇩🇪 Германия | TUIC')}`;
        configsText += tuicLink + '\n';
      } else {
        console.log(`⏩ Skipping offline main node: ${mainHost}`);
      }

      // Dynamic VLESS TCP/gRPC nodes disabled (blocked by ISP and TSPU)

      // Add Hysteria 2 connection URL if configured
      if (config.XUI_HY2_INBOUND_ID) {
        const mainHy2Url = await xuiApi.buildHysteria2Link(sub.client_uuid);
        configsText += mainHy2Url + '\n';

        // Add Hysteria 2 for other active nodes
        try {
          const nodes = await xuiApi.getNodes();
          for (const node of nodes) {
            if (node.address) {
              // Skip Poland — it has a dedicated static Hysteria 2 profile above with correct port/SNI
              if (node.address === '188.255.163.236' || node.address === process.env.PL_SSH_HOST) {
                continue;
              }
              const isStaticNode = node.address === '194.50.94.46' || node.address === '31.76.46.20' || node.address === '188.255.163.236' || node.address === process.env.NL_SSH_HOST || node.address === process.env.FI_SSH_HOST || node.address === process.env.PL_SSH_HOST;
              if (!isStaticNode && xuiApi.isNodeOffline(node.address)) {
                continue;
              }
              const nodeRemark = node.remark
                ? `${node.remark} | Hysteria 2`
                : `Узел ${node.id} | Hysteria 2`;
              const nodeHy2Url = await xuiApi.buildHysteria2Link(sub.client_uuid, node.address, nodeRemark);
              configsText += nodeHy2Url + '\n';
            }
          }
        } catch (nodeErr) {
          console.error('⚠️ Failed to add dynamic Hysteria 2 nodes to subscription:', nodeErr.message);
        }
      }

      // VLESS WS+TLS over Cloudflare CDN (bypass TSPU TCP blocks on DE/NL/FI)
      // Chain: client -> CF:443 (TLS, edge cert) -> origin:80 (nginx) -> xray:127.0.0.1:10883 (VLESS WS)
      if (config.XUI_VLESS_CDN_INBOUND_ID) {
        const cfPath = encodeURIComponent('/kn1cf');
        const cfNodes = [
          { host: 'de.knight1.space', remark: '🇩🇪 Германия | CF' },
          { host: 'nl.knight1.space', remark: '🇳🇱 Нидерланды | CF' },
          { host: 'fi.knight1.space', remark: '🇫🇮 Финляндия | CF' },
        ];
        for (const n of cfNodes) {
          const url = `vless://${sub.client_uuid}@${n.host}:443?encryption=none&security=tls&sni=${n.host}&type=ws&host=${n.host}&path=${cfPath}&fp=chrome#${encodeURIComponent(n.remark)}`;
          configsText += url + '\n';
        }
      }
    }


    // Bypass configurations (VLESS XHTTP over CDN for LTE/4G whitelist bypass)
    if (config.ENABLE_LTE_BYPASS && (!testMode || testMode === 'ru')) {
      let bypassUuid = null;
      if (sub.bypass_connection_url) {
        const uuidMatch = sub.bypass_connection_url.match(/vless:\/\/([^@]+)@/);
        if (uuidMatch) bypassUuid = uuidMatch[1];
      }
      if (!bypassUuid && sub.client_uuid) {
        const hash = crypto.createHash('sha256').update(sub.client_uuid).digest('hex');
        bypassUuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
      }

      if (bypassUuid) {
        // CDN Germany VLESS XHTTP over Port 443 (Unblockable bypass)
        const bypassUrl = xuiApi.buildXhttpLink(bypassUuid);
        configsText += bypassUrl + '\n';
      }
    }

    // Add reserve nodes from goida-vpn-configs
    if (!testMode || testMode === 'de' || testMode === 'ru') {
      try {
        const countryNames = {
          'DE': { name: 'Германия', flag: '🇩🇪' },
          'NL': { name: 'Нидерланды', flag: '🇳🇱' },
          'PL': { name: 'Польша', flag: '🇵🇱' },
          'FR': { name: 'Франция', flag: '🇫🇷' },
          'RU': { name: 'Россия', flag: '🇷🇺' },
          'SG': { name: 'Сингапур', flag: '🇸🇬' }
        };

        const counts = {};
        for (const resNode of reserveNodes) {
          const cCode = resNode.country;
          if (testMode === 'de' && cCode !== 'DE') continue;
          if (testMode === 'ru' && cCode !== 'RU') continue;

          let url = resNode.url;
          if (!counts[cCode]) counts[cCode] = 1;

          const cInfo = countryNames[cCode] || { name: cCode, flag: '🌐' };
          let newRemark;
          if (cCode === 'RU') {
            newRemark = `🇷🇺 LTE | Обходка #${counts[cCode]++}`;
          } else {
            newRemark = `${cInfo.flag} ${cInfo.name} | Резерв ${counts[cCode]++}`;
          }
          
          if (url.includes('#')) {
            url = url.split('#')[0] + '#' + newRemark;
          } else {
            url = url + '#' + newRemark;
          }
          configsText += url + '\n';
        }
      } catch (resErr) {
        console.error('⚠️ Failed to add reserve nodes to subscription:', resErr.message);
      }
    }

    // Custom VLESS gRPC node disabled (blocked by ISP and TSPU)

    // Base64 encode the connection URLs (standard format for V2Ray subscriptions)
    const base64Config = Buffer.from(configsText).toString('base64');
    
    res.send(base64Config);
  } catch (error) {
    console.error('Subscription server error:', error);
    res.status(500).send('Internal server error.');
  }
});

// Allowed redirect targets. Blocks open-redirect phishing/abuse.
const ALLOWED_REDIRECT_SCHEMES = new Set(['happ', 'happ-proxy', 'happ-proxy-utility', 'incy']);
const ALLOWED_REDIRECT_HOSTS = new Set([
  'crypto.happ.su',
  'apps.apple.com',
  'play.google.com',
  'github.com'
]);

function isRedirectAllowed(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Allow known app deep-link schemes (used by the import wizard)
  if (ALLOWED_REDIRECT_SCHEMES.has(parsed.protocol.replace(':', ''))) {
    return true;
  }

  // Only https is allowed for web URLs
  if (parsed.protocol !== 'https:') return false;

  // Reject URLs with credentials, IP literals and unusual characters
  if (parsed.username || parsed.password) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) return false;
  if (/[\s\x00-\x1f\x7f]/.test(url)) return false;

  // Allow exact hosts or subdomains of trusted hosts
  const hostname = parsed.hostname.toLowerCase();
  if (ALLOWED_REDIRECT_HOSTS.has(hostname)) return true;
  for (const allowed of ALLOWED_REDIRECT_HOSTS) {
    if (hostname === allowed || hostname.endsWith('.' + allowed)) return true;
  }

  return false;
}

app.get('/redirect', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  if (!isRedirectAllowed(targetUrl)) {
    console.warn(`🚫 Blocked disallowed redirect attempt to: ${String(targetUrl).substring(0, 200)}`);
    return res.status(400).send('Invalid or disallowed redirect URL.');
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Redirecting...</title>
    <script>
        window.onload = function() {
            window.location.href = ${JSON.stringify(targetUrl)};
        };
    </script>
</head>
<body>
    <p>Redirecting, please wait... If nothing happens, <a href="${targetUrl}">click here</a>.</p>
</body>
</html>
  `);
});

app.get('/import/:uuid?', async (req, res) => {
  const { uuid } = req.params;
  const subUrl = uuid ? `${config.SUB_SERVER_URL}/sub/${uuid}` : '';

  let cryptoUrl = '';
  if (uuid) {
    try {
      const response = await axios.post('https://crypto.happ.su/api-v2.php', {
        url: subUrl
      }, { timeout: 3000 });
      if (response.data && response.data.encrypted_link) {
        cryptoUrl = response.data.encrypted_link;
      }
    } catch (err) {
      console.error('⚠️ Failed to encrypt subscription link via Happ API:', err.message);
    }
  }

  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Инструкция по установке | Knight VPN</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0d12;
            --card-bg: rgba(22, 28, 41, 0.45);
            --primary: #5850ec;
            --primary-glow: rgba(88, 80, 236, 0.35);
            --accent: #10b981;
            --text-main: #f9fafb;
            --text-muted: #9ca3af;
            --border: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(88, 80, 236, 0.5);
            --gradient-main: linear-gradient(135deg, #a5b4fc, #818cf8, #5850ec);
            --gradient-btn: linear-gradient(135deg, #5850ec, #4f46e5);
            --shadow-card: 0 20px 40px rgba(0, 0, 0, 0.45);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px 15px;
            overflow-x: hidden;
            position: relative;
        }

        /* Ambient glow background */
        body::before {
            content: '';
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(88, 80, 236, 0.12) 0%, transparent 70%);
            top: 15%;
            left: 5%;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 450px;
            height: 450px;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%);
            bottom: 10%;
            right: 5%;
            z-index: 0;
            pointer-events: none;
        }

        .container {
            position: relative;
            z-index: 10;
            width: 100%;
            max-width: 520px;
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border);
            border-radius: 28px;
            padding: 35px 25px;
            box-shadow: var(--shadow-card);
            animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 25px;
        }

        .logo {
            font-family: 'Outfit', sans-serif;
            font-size: 32px;
            font-weight: 800;
            background: var(--gradient-main);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.5px;
        }

        .subtitle {
            font-size: 14px;
            color: var(--text-muted);
            text-align: center;
            margin-top: -15px;
            margin-bottom: 30px;
            line-height: 1.5;
        }

        /* OS Selector Tabs */
        .os-selector {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 25px;
            background: rgba(255, 255, 255, 0.03);
            padding: 6px;
            border-radius: 16px;
            border: 1px solid var(--border);
        }

        .os-tab {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 12px 6px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 11px;
            font-weight: 600;
        }

        .os-tab span {
            font-size: 20px;
        }

        .os-tab:hover {
            color: var(--text-main);
            background: rgba(255, 255, 255, 0.04);
        }

        .os-tab.active {
            color: #ffffff;
            background: var(--primary);
            box-shadow: 0 4px 15px var(--primary-glow);
        }

        /* Section titles */
        .section-title {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-muted);
            margin-bottom: 14px;
            text-align: left;
            font-weight: 700;
            padding-left: 2px;
        }

        /* App Selection Cards */
        .apps-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
            margin-bottom: 30px;
        }

        .app-card {
            display: flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 16px 20px;
            cursor: pointer;
            position: relative;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: left;
        }

        .app-card:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: var(--border-hover);
            transform: translateY(-2px);
        }

        .app-card.selected {
            background: rgba(88, 80, 236, 0.08);
            border-color: var(--primary);
            box-shadow: 0 0 20px rgba(88, 80, 236, 0.15);
        }

        .app-icon {
            font-size: 28px;
            margin-right: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            border: 1px solid var(--border);
        }

        .app-card.selected .app-icon {
            background: rgba(88, 80, 236, 0.15);
            border-color: rgba(88, 80, 236, 0.3);
        }

        .app-details {
            flex: 1;
        }

        .app-details h3 {
            font-size: 15.5px;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .app-details p {
            font-size: 12.5px;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .badge-recommended {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            font-size: 9.5px;
            font-weight: 700;
            padding: 2.5px 7px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-paid {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: white;
            font-size: 9.5px;
            font-weight: 700;
            padding: 2.5px 7px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .app-selector-dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 10px;
            transition: all 0.2s;
        }

        .app-card.selected .app-selector-dot {
            border-color: var(--primary);
            background: var(--primary);
        }

        .app-card.selected .app-selector-dot::after {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: white;
        }

        /* Step-by-Step Instructions Container */
        .instructions-container {
            background: rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 24px;
            text-align: left;
            animation: fadeIn 0.4s ease-out;
        }

        .step-item {
            margin-bottom: 24px;
            position: relative;
            padding-left: 36px;
        }

        .step-item:last-child {
            margin-bottom: 0;
        }

        .step-number {
            position: absolute;
            left: 0;
            top: 0;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12.5px;
            font-weight: 700;
            color: var(--primary);
        }

        .step-item.active .step-number {
            background: var(--primary);
            border-color: var(--primary);
            color: white;
            box-shadow: 0 0 10px var(--primary-glow);
        }

        .step-title {
            font-size: 14.5px;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 8px;
        }

        .step-desc {
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.5;
            margin-bottom: 12px;
        }

        /* Action Buttons styling */
        .btn-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 13px 20px;
            background: var(--gradient-btn);
            color: white;
            font-size: 13.5px;
            font-weight: 600;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px rgba(88, 80, 236, 0.25);
            margin-bottom: 10px;
            text-align: center;
        }

        .btn-action:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(88, 80, 236, 0.4);
            filter: brightness(1.1);
        }

        .btn-action:active {
            transform: translateY(0);
        }

        .btn-action-outline {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 12px 20px;
            background: rgba(255, 255, 255, 0.02);
            color: var(--text-main);
            font-size: 13.5px;
            font-weight: 600;
            border: 1px solid var(--border);
            border-radius: 12px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.25s ease;
            margin-bottom: 10px;
            text-align: center;
        }

        .btn-action-outline:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: var(--text-muted);
        }

        .btn-secondary-action {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
        }

        .btn-secondary-action:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }

        /* Info box warning */
        .warning-box {
            background: rgba(245, 158, 11, 0.08);
            border: 1px solid rgba(245, 158, 11, 0.18);
            border-radius: 12px;
            padding: 12px 16px;
            margin-top: 15px;
            font-size: 12px;
            color: #fbd38d;
            line-height: 1.5;
        }

        .warning-title {
            font-weight: 700;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .error-box {
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.18);
            border-radius: 12px;
            padding: 14px;
            font-size: 12.5px;
            color: #fca5a5;
            line-height: 1.5;
            margin-top: 10px;
        }

        .footer {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 25px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <div class="logo">⚔️ Knight VPN</div>
        </div>
        
        <div class="subtitle">Интерактивный помощник по установке и подключению подписки на ваших устройствах.</div>

        <div class="section-title">1. Выберите устройство</div>
        <div class="os-selector">
            <button class="os-tab active" onclick="selectOS('ios')">
                <span>🍏</span> iOS
            </button>
            <button class="os-tab" onclick="selectOS('android')">
                <span>🤖</span> Android
            </button>
            <button class="os-tab" onclick="selectOS('windows')">
                <span>💻</span> Windows
            </button>
            <button class="os-tab" onclick="selectOS('macos')">
                <span>🍎</span> macOS
            </button>
        </div>

        <div class="section-title">2. Выберите приложение</div>
        <div class="apps-grid" id="apps-grid">
            <!-- App cards will be dynamically injected here -->
        </div>

        <div class="section-title">3. Следуйте инструкции</div>
        <div class="instructions-container" id="instructions-container">
            <!-- Steps will be dynamically injected here -->
        </div>

        <div class="footer">
            Knight VPN — Быстрый и безопасный интернет без блокировок.
        </div>
    </div>

    <script>
        const subUrl = "${subUrl}";
        const cryptoUrl = "${cryptoUrl}";
        const hasSub = !!subUrl;

        function openExternalUrl(url) {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                window.Telegram.WebApp.openLink(url);
            } else {
                window.open(url, '_blank');
            }
        }

        function openSchemeUrl(schemeUrl) {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                const redirectUrl = window.location.origin + "/redirect?url=" + encodeURIComponent(schemeUrl);
                window.Telegram.WebApp.openLink(redirectUrl);
            } else {
                window.location.href = schemeUrl;
            }
        }

        const appData = {
            ios: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Легкий и быстрый современный клиент.',
                    badge: 'Рекомендуется',
                    icon: '🍏',
                    step1_desc: 'Установите официальное приложение <b>Happ Utility</b> из App Store по кнопке ниже:',
                    btn_download_text: '🍏 Скачать Happ из App Store (Global)',
                    btn_download_url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
                    rf_notice: '⚠️ В российском регионе App Store приложение <b>Happ Plus</b> в данный момент скачать нельзя. Пожалуйста, воспользуйтесь приложением <b>iNCY</b>.',
                    import_fn: 'importHapp'
                },
                {
                    id: 'incy',
                    name: 'iNCY',
                    desc: 'Новый удобный клиент для iOS с автоимпортом.',
                    badge: '',
                    icon: '⚡️',
                    step1_desc: 'Установите официальное приложение <b>iNCY</b> из App Store по кнопке ниже:',
                    btn_download_text: '🍏 Скачать iNCY из App Store',
                    btn_download_url: 'https://apps.apple.com/ru/app/incy/id6756943388',
                    import_fn: 'importIncy'
                }
            ],
            android: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Простой клиент с экономным потреблением батареи.',
                    badge: 'Рекомендуется',
                    icon: '🤖',
                    step1_desc: 'Установите приложение из Google Play или скачайте APK-файл напрямую:',
                    btn_download_text: '🤖 Скачать из Google Play',
                    btn_download_url: 'https://play.google.com/store/apps/details?id=com.happproxy',
                    btn_download_text2: '📦 Скачать Happ APK (напрямую)',
                    btn_download_url2: 'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk',
                    import_fn: 'importHapp'
                },
                {
                    id: 'incy',
                    name: 'iNCY',
                    desc: 'Современный клиент с простым интерфейсом.',
                    badge: '',
                    icon: '🤖',
                    step1_desc: 'Установите приложение из Google Play или скачайте APK-файл напрямую:',
                    btn_download_text: '🤖 Скачать из Google Play',
                    btn_download_url: 'https://play.google.com/store/apps/details?id=llc.itdev.incy',
                    btn_download_text2: '📦 Скачать iNCY APK (напрямую)',
                    btn_download_url2: 'https://github.com/INCY-DEV/incy-platforms/releases/latest/download/Incy.apk',
                    import_fn: 'importIncy'
                }
            ],
            windows: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Новый и невероятно удобный клиент для ПК на Windows.',
                    badge: 'Рекомендуется',
                    icon: '💻',
                    step1_desc: 'Скачайте установщик приложения (.exe) напрямую по кнопке ниже и запустите установку:',
                    btn_download_text: '📥 Скачать Happ для Windows (.exe)',
                    btn_download_url: 'https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe',
                    import_fn: 'importHapp'
                },
                {
                    id: 'incy',
                    name: 'iNCY',
                    desc: 'Удобный клиент для Windows с автонастройкой.',
                    badge: '',
                    icon: '💻',
                    step1_desc: 'Скачайте программу установки (.exe) напрямую и запустите её:',
                    btn_download_text: '📥 Скачать iNCY для Windows (.exe)',
                    btn_download_url: 'https://github.com/INCY-DEV/incy-platforms/releases/latest/download/incy-windows-setup.exe',
                    import_fn: 'importIncy'
                }
            ],
            macos: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Прекрасно оптимизированное приложение (для процессоров Apple M1/M2/M3).',
                    badge: 'Рекомендуется',
                    icon: '🍎',
                    step1_desc: 'Установите официальное приложение из App Store для macOS:',
                    btn_download_text: '🍏 Скачать Happ из App Store (Global)',
                    btn_download_url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
                    rf_notice: '⚠️ В российском регионе App Store приложение <b>Happ Plus</b> в данный момент скачать нельзя. Пожалуйста, воспользуйтесь приложением <b>iNCY</b>.',
                    import_fn: 'importHapp'
                },
                {
                    id: 'incy',
                    name: 'iNCY',
                    desc: 'Кроссплатформенный клиент для macOS Intel & Apple Silicon.',
                    badge: '',
                    icon: '🍎',
                    step1_desc: 'Скачайте установочный файл .dmg по кнопкам ниже в зависимости от процессора:',
                    btn_download_text: '📦 Скачать iNCY для Apple Silicon (M1/M2/M3)',
                    btn_download_url: 'https://github.com/INCY-DEV/incy-platforms/releases/latest/download/incy-macos-arm64.dmg',
                    btn_download_text2: '📦 Скачать iNCY для Mac Intel',
                    btn_download_url2: 'https://github.com/INCY-DEV/incy-platforms/releases/latest/download/incy-macos-intel.dmg',
                    import_fn: 'importIncy'
                }
            ]
        };

        let currentOS = 'ios';
        let selectedAppId = 'happ';

        function selectOS(os) {
            currentOS = os;
            
            // Update tab UI
            const tabs = document.querySelectorAll('.os-tab');
            tabs.forEach(tab => {
                const isMatch = tab.getAttribute('onclick').includes("'" + os + "'");
                if (isMatch) tab.classList.add('active');
                else tab.classList.remove('active');
            });

            // Set default app for this OS
            const apps = appData[os];
            const hasHapp = apps.some(a => a.id === 'happ');
            selectedAppId = hasHapp ? 'happ' : apps[0].id;

            renderApps();
            renderInstructions();
        }

        function selectApp(appId) {
            selectedAppId = appId;
            renderApps();
            renderInstructions();
        }

        function renderApps() {
            const apps = appData[currentOS];
            const grid = document.getElementById('apps-grid');
            grid.innerHTML = '';

            apps.forEach(app => {
                const isSelected = app.id === selectedAppId;
                let badgeHtml = '';
                if (app.badge) {
                    const badgeClass = app.badge.indexOf('Рекомендуется') !== -1 ? 'badge-recommended' : 'badge-paid';
                    badgeHtml = ' <span class="' + badgeClass + '">' + app.badge + '</span>';
                }
                
                const card = document.createElement('div');
                card.className = 'app-card' + (isSelected ? ' selected' : '');
                card.setAttribute('onclick', "selectApp('" + app.id + "')");
                card.innerHTML = 
                    '<div class="app-icon">' + app.icon + '</div>' +
                    '<div class="app-details">' +
                        '<h3>' + app.name + badgeHtml + '</h3>' + // Wait, let's fix h3 opening tag! It should be '<h3>' + app.name + badgeHtml + '</h3>'
                        '<p>' + app.desc + '</p>' +
                    '</div>' +
                    '<div class="app-selector-dot"></div>';
                grid.appendChild(card);
            });
        }

        function renderInstructions() {
            const apps = appData[currentOS];
            const app = apps.find(a => a.id === selectedAppId);
            const container = document.getElementById('instructions-container');
            container.innerHTML = '';

            if (!app) return;

            // 1. Step 1: Download
            let step1Html = 
                '<div class="step-item active">' +
                    '<div class="step-number">1</div>' +
                    '<div class="step-title">Установка приложения</div>' +
                    '<div class="step-desc">' + app.step1_desc + '</div>' +
                    '<a href="' + app.btn_download_url + '" onclick="openExternalUrl(this.href); return false;" class="btn-action">' + app.btn_download_text + '</a>';
            if (app.btn_download_url2) {
                step1Html += '<a href="' + app.btn_download_url2 + '" onclick="openExternalUrl(this.href); return false;" class="btn-action-outline">' + app.btn_download_text2 + '</a>';
            }
            if (app.rf_notice) {
                step1Html += '<div class="error-box">' + app.rf_notice + '</div>';
            }
            step1Html += '</div>';

            // 2. Step 2: Import Key / Subscribe
            let step2Html = '';
            if (hasSub) {
                const warningMsg = config.ENABLE_LTE_BYPASS
                    ? 'На резервном обходном ключе (для LTE) установлен лимит 15 ГБ. Использование торрентов строго запрещено!'
                    : 'Использование торрентов строго запрещено!';
                step2Html = 
                    '<div class="step-item active">' +
                        '<div class="step-number">2</div>' +
                        '<div class="step-title">Подключение подписки</div>' +
                        '<div class="step-desc">Нажмите кнопку авто-импорта ниже. Устройство автоматически откроет выбранное приложение и добавит конфигурацию:</div>' +
                        '<button onclick="' + app.import_fn + '()" class="btn-action">⚡️ Авто-подключение подписки</button>' +
                        '<button onclick="copySubUrl()" class="btn-action-outline btn-secondary-action">📋 Скопировать ссылку вручную</button>' +
                        '<div class="warning-box">' +
                            '<div class="warning-title">⚠️ Обратите внимание:</div>' +
                            warningMsg +
                        '</div>' +
                    '</div>';
            } else {
                step2Html = 
                    '<div class="step-item active">' +
                        '<div class="step-number">2</div>' +
                        '<div class="step-title">Подключение подписки</div>' +
                        '<div class="error-box">' +
                            '⚠️ <b>Ключ не обнаружен:</b><br>' +
                            'У вас нет активной подписки. Пожалуйста, вернитесь в Telegram-бот и активируйте бесплатный тест на 3 дня (в разделе 👤 <b>Мой профиль</b>) или приобретите платную подписку.' +
                        '</div>' +
                    '</div>';
            }

            // 3. Step 3: Start VPN
            const step3Html = 
                '<div class="step-item">' +
                    '<div class="step-number">3</div>' +
                    '<div class="step-title">Запуск VPN соединения</div>' +
                    '<div class="step-desc">' +
                        'Откройте приложение <b>' + app.name + '</b>, выберите добавленный профиль <b>Knight VPN</b> и нажмите кнопку включения/подключения. При первом запуске разрешите системе создать VPN-подключение.' +
                    '</div>' +
                '</div>';

            container.innerHTML = step1Html + step2Html + step3Html;
        }

        // Action triggers
        function importHapp() {
            if (!hasSub) return;
            if (cryptoUrl) {
                openSchemeUrl(cryptoUrl);
                setTimeout(function() {
                    openSchemeUrl("happ://add/" + subUrl);
                }, 1500);
                return;
            }

            openSchemeUrl("happ://add/" + subUrl);
            setTimeout(function() { openSchemeUrl("happ-proxy://add/" + subUrl); }, 150);
            setTimeout(function() { openSchemeUrl("happ-proxy-utility://add/" + subUrl); }, 300);
            setTimeout(function() { openSchemeUrl("happ://import/#" + subUrl); }, 450);
            setTimeout(function() { openSchemeUrl("happ-proxy://import/#" + subUrl); }, 600);
            setTimeout(function() { openSchemeUrl("happ://yargs?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN"); }, 750);
            setTimeout(function() { openSchemeUrl("happ://import?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN"); }, 900);
        }

        function importIncy() {
            if (!hasSub) return;
            openSchemeUrl("incy://import/" + subUrl);
        }

        function copySubUrl() {
            if (!hasSub) return;
            navigator.clipboard.writeText(subUrl).then(function() {
                alert('Ссылка подписки скопирована в буфер обмена!');
            }, function(err) {
                const el = document.createElement('textarea');
                el.value = subUrl;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                alert('Ссылка подписки скопирована в буфер обмена!');
            });
        }

        // Initialize setup
        selectOS('ios');
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.ready();
        }
    </script>
</body>
</html>
  `);
});

export function startSubServer() {
  const certPath = config.SSL_CERT_PATH;
  const keyPath = config.SSL_KEY_PATH;

  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      https.createServer(options, app).listen(PORT, '127.0.0.1', () => {
        console.log(`🔒 SECURE Subscription server running on https://127.0.0.1:${PORT}`);
      });
      return;
    } catch (err) {
      console.error('⚠️ Failed to start secure subscription server, falling back to HTTP:', err.message);
    }
  }

  http.createServer(app).listen(PORT, '127.0.0.1', () => {
    console.log(`🌐 Subscription server running on http://127.0.0.1:${PORT}`);
  });
}
