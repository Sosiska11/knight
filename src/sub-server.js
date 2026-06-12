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

const app = express();
const PORT = config.SUB_PORT;

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

    const supportLink = 't.me/knightvpn_help';
    const noticeText = `⚔️ Personal Knight VPN, sup - ${supportLink}\\nSubscription: ${daysLeft} days\\n\\n⚠️ Резервный профиль (LTE) имеет лимит 15 ГБ. \\n🚫 Торренты строго запрещены! \\n🆘 Поддержка: @knightvpn_help`;

    // Set Headers for Hiddify, Shadowrocket, Sing-box, etc.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('profile-update-interval', '1');
    // Encode unicode emoji safely for Node.js headers using binary/latin1 encoding
    res.setHeader('profile-title', Buffer.from('⚔️ Knight VPN').toString('binary'));
    res.setHeader('profile-notice', Buffer.from(noticeText).toString('binary'));
    res.setHeader('profile-web-page-url', 'https://t.me/knightvpn_help');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''KnightVPN");
    
    // Shows traffic usage (1 TB total) and expiration date inside Hiddify
    res.setHeader(
      'subscription-userinfo',
      `upload=0; download=0; total=1099511627776; expire=${expireTimestamp}`
    );

    // Dynamically override the server name/remark with a beautiful name and flag
    const mainHostMatch = sub.connection_url.match(/@([^:]+):/);
    const mainHost = mainHostMatch ? mainHostMatch[1] : null;

    let configsText = '';

    if (!mainHost || !xuiApi.isNodeOffline(mainHost)) {
      let connectionUrl = sub.connection_url;
      if (connectionUrl.includes('#')) {
        connectionUrl = connectionUrl.split('#')[0] + '#🇳🇱 Нидерланды';
      } else {
        connectionUrl = connectionUrl + '#🇳🇱 Нидерланды';
      }
      configsText += connectionUrl + '\n';
    } else {
      console.log(`⏩ Skipping offline main node: ${mainHost}`);
    }

    // Fetch active nodes from 3x-ui and dynamically add VLESS links for them
    try {
      const nodes = await xuiApi.getNodes();
      for (const node of nodes) {
        if (node.address) {
          // Check if this node is marked as offline
          if (xuiApi.isNodeOffline(node.address)) {
            console.log(`⏩ Skipping offline node: ${node.address}`);
            continue;
          }

          // Replace host in connection_url with node.address
          let nodeUrl = sub.connection_url.replace(/@([^:]+):/, `@${node.address}:`);
          
          // Set name/remark for the node (e.g. #🇩🇪 Германия)
          const nodeRemark = node.remark || `Узел ${node.id}`;
          nodeUrl = nodeUrl.split('#')[0] + '#' + nodeRemark;
          
          configsText += nodeUrl + '\n';
        }
      }
    } catch (nodeErr) {
      console.error('⚠️ Failed to add dynamic nodes to subscription:', nodeErr.message);
    }

    // Generate multiple bypass links with different whitelisted SNIs
    if (sub.bypass_connection_url) {
      const sniBypasses = [
        { name: 'Gosuslugi', sni: 'gosuslugi.ru' },
        { name: 'Yandex', sni: 'yandex.ru' },
        { name: 'VK', sni: 'vk.com' },
        { name: 'Mail.ru', sni: 'mail.ru' }
      ];

      for (const bp of sniBypasses) {
        let bypassUrl = sub.bypass_connection_url || sub.connection_url;
        
        // Rewrite port to 8443 for transit routing via iptables
        bypassUrl = bypassUrl.replace(/@([^:]+):([0-9]+)/, '@$1:8443');
        
        // Resolve host to transit host or raw IP to bypass DNS blocking
        const hostMatch = bypassUrl.match(/@([^:]+):/);
        if (hostMatch) {
          const hostName = hostMatch[1];
          if (config.BYPASS_HOST) {
            bypassUrl = bypassUrl.replace(`@${hostName}:`, `@${config.BYPASS_HOST}:`);
          } else if (!/^[0-9.]+$/.test(hostName)) {
            try {
              const resolved = await dns.promises.lookup(hostName);
              if (resolved && resolved.address) {
                bypassUrl = bypassUrl.replace(`@${hostName}:`, `@${resolved.address}:`);
              }
            } catch (dnsErr) {
              console.warn(`⚠️ Failed to resolve host ${hostName} for bypass link:`, dnsErr.message);
            }
          }
        }
        
        // Replace or add sni parameter
        if (bypassUrl.includes('sni=')) {
          bypassUrl = bypassUrl.replace(/sni=[^&]+/g, `sni=${bp.sni}`);
        } else {
          const parts = bypassUrl.split('?');
          if (parts.length > 1) {
            const queryAndHash = parts[1].split('#');
            queryAndHash[0] = `sni=${bp.sni}&` + queryAndHash[0];
            bypassUrl = parts[0] + '?' + queryAndHash.join('#');
          }
        }

        // Set name/remark for the bypass
        const newRemark = `🇷🇺 LTE | Обходка (${bp.name})`;
        if (bypassUrl.includes('#')) {
          bypassUrl = bypassUrl.split('#')[0] + '#' + newRemark;
        } else {
          bypassUrl = bypassUrl + '#' + newRemark;
        }
        configsText += bypassUrl + '\n';
      }
    }

    // Add reserve nodes from goida-vpn-configs
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
        let url = resNode.url;
        const cCode = resNode.country;
        if (!counts[cCode]) counts[cCode] = 1;

        const cInfo = countryNames[cCode] || { name: cCode, flag: '🌐' };
        const newRemark = `${cInfo.flag} ${cInfo.name} | Резерв ${counts[cCode]++}`;
        
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

    // Base64 encode the connection URLs (standard format for V2Ray subscriptions)
    const base64Config = Buffer.from(configsText).toString('base64');
    
    res.send(base64Config);
  } catch (error) {
    console.error('Subscription server error:', error);
    res.status(500).send('Internal server error.');
  }
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

        const appData = {
            ios: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Легкий и быстрый современный клиент.',
                    badge: 'Рекомендуется',
                    icon: '🍏',
                    step1_desc: 'Установите официальное приложение <b>Happ Proxy Utility</b> из App Store по кнопке ниже:',
                    btn_download_text: '🍏 Скачать Happ из App Store',
                    btn_download_url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
                    btn_download_text2: '🍏 Скачать Happ Plus (РФ регион)',
                    btn_download_url2: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973?l=en-GB',
                    import_fn: 'importHapp'
                },
                {
                    id: 'hiddify',
                    name: 'Hiddify',
                    desc: 'Популярное кроссплатформенное приложение с автонастройкой.',
                    badge: '',
                    icon: '🔗',
                    step1_desc: 'Установите официальное приложение <b>Hiddify</b> из App Store по кнопке ниже:',
                    btn_download_text: '🍏 Скачать Hiddify из App Store',
                    btn_download_url: 'https://apps.apple.com/us/app/hiddify/id624250220',
                    import_fn: 'importHiddify'
                },
                {
                    id: 'shadowrocket',
                    name: 'Shadowrocket',
                    desc: 'Платное профессиональное приложение со множеством настроек.',
                    badge: 'Платное (2.99$)',
                    icon: '🚀',
                    step1_desc: 'Купите и установите приложение <b>Shadowrocket</b> из App Store по ссылке ниже:',
                    btn_download_text: '🚀 Купить Shadowrocket',
                    btn_download_url: 'https://apps.apple.com/us/app/shadowrocket/id932747118',
                    import_fn: 'importShadowrocket'
                }
            ],
            android: [
                {
                    id: 'happ',
                    name: 'Happ',
                    desc: 'Простой клиент с экономным потреблением батареи.',
                    badge: 'Рекомендуется',
                    icon: '🤖',
                    step1_desc: 'Скачайте и установите установочный APK-файл напрямую по ссылке ниже:',
                    btn_download_text: '🤖 Скачать Happ (.apk)',
                    btn_download_url: 'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk',
                    import_fn: 'importHapp'
                },
                {
                    id: 'hiddify',
                    name: 'Hiddify',
                    desc: 'Современный клиент с интуитивным дизайном и обходом блокировок.',
                    badge: '',
                    icon: '🔗',
                    step1_desc: 'Установите приложение из Google Play или скачайте APK-файл напрямую:',
                    btn_download_text: '🤖 Скачать из Google Play',
                    btn_download_url: 'https://play.google.com/store/apps/details?id=app.hiddify.com',
                    btn_download_text2: '📦 Скачать Hiddify APK (напрямую)',
                    btn_download_url2: 'https://github.com/hiddify/hiddify-next/releases/latest/download/hiddify-android-universal.apk',
                    import_fn: 'importHiddify'
                },
                {
                    id: 'singbox',
                    name: 'Sing-box',
                    desc: 'Официальный клиент на базе стабильного ядра Sing-box.',
                    badge: '',
                    icon: '📦',
                    step1_desc: 'Установите приложение из Google Play или скачайте APK-файл напрямую:',
                    btn_download_text: '🤖 Скачать из Google Play',
                    btn_download_url: 'https://play.google.com/store/apps/details?id=io.nekohasekai.sfa',
                    btn_download_text2: '📦 Скачать Sing-box APK (напрямую)',
                    btn_download_url2: 'https://github.com/SagerNet/sing-box/releases/latest/download/sing-box-universal.apk',
                    import_fn: 'importSingBox'
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
                    id: 'hiddify',
                    name: 'Hiddify',
                    desc: 'Интерфейсный клиент для ПК с удобной интеграцией.',
                    badge: '',
                    icon: '🔗',
                    step1_desc: 'Скачайте программу установки (.exe) напрямую и запустите её:',
                    btn_download_text: '📥 Скачать Hiddify для Windows (.exe)',
                    btn_download_url: 'https://github.com/hiddify/hiddify-next/releases/latest/download/Hiddify-Windows-Setup-x64.exe',
                    import_fn: 'importHiddify'
                },
                {
                    id: 'singbox',
                    name: 'Sing-box',
                    desc: 'Стабильное консольное и GUI ядро для опытных пользователей.',
                    badge: '',
                    icon: '📦',
                    step1_desc: 'Скачайте архив приложения (.zip) напрямую по кнопке ниже:',
                    btn_download_text: '📥 Скачать Sing-box для Windows (ZIP)',
                    btn_download_url: 'https://github.com/SagerNet/sing-box/releases/latest/download/sing-box-windows-amd64.zip',
                    import_fn: 'importSingBox'
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
                    btn_download_text: '🍏 Скачать Happ из App Store',
                    btn_download_url: 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215',
                    btn_download_text2: '🍏 Скачать Happ Plus (РФ регион)',
                    btn_download_url2: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973?l=en-GB',
                    import_fn: 'importHapp'
                },
                {
                    id: 'hiddify',
                    name: 'Hiddify',
                    desc: 'Кроссплатформенный клиент для macOS Intel & Apple Silicon.',
                    badge: '',
                    icon: '🔗',
                    step1_desc: 'Установите Hiddify из App Store или скачайте установочный файл .dmg:',
                    btn_download_text: '🍏 Скачать из App Store',
                    btn_download_url: 'https://apps.apple.com/us/app/hiddify/id624250220',
                    btn_download_text2: '📦 Скачать Hiddify DMG для macOS',
                    btn_download_url2: 'https://github.com/hiddify/hiddify-next/releases/latest/download/Hiddify-MacOS.dmg',
                    import_fn: 'importHiddify'
                },
                {
                    id: 'singbox',
                    name: 'Sing-box',
                    desc: 'Официальный macOS клиент для прямого импорта.',
                    badge: '',
                    icon: '📦',
                    step1_desc: 'Установите приложение Sing-box из Mac App Store по кнопке ниже:',
                    btn_download_text: '🍏 Скачать Sing-box из App Store',
                    btn_download_url: 'https://apps.apple.com/us/app/sing-box-vt/id6451272673',
                    import_fn: 'importSingBox'
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
                    '<a href="' + app.btn_download_url + '" target="_blank" class="btn-action">' + app.btn_download_text + '</a>';
            if (app.btn_download_url2) {
                step1Html += '<a href="' + app.btn_download_url2 + '" target="_blank" class="btn-action-outline">' + app.btn_download_text2 + '</a>';
            }
            step1Html += '</div>';

            // 2. Step 2: Import Key / Subscribe
            let step2Html = '';
            if (hasSub) {
                step2Html = 
                    '<div class="step-item active">' +
                        '<div class="step-number">2</div>' +
                        '<div class="step-title">Подключение подписки</div>' +
                        '<div class="step-desc">Нажмите кнопку авто-импорта ниже. Устройство автоматически откроет выбранное приложение и добавит конфигурацию:</div>' +
                        '<button onclick="' + app.import_fn + '()" class="btn-action">⚡️ Авто-подключение подписки</button>' +
                        '<button onclick="copySubUrl()" class="btn-action-outline btn-secondary-action">📋 Скопировать ссылку вручную</button>' +
                        '<div class="warning-box">' +
                            '<div class="warning-title">⚠️ Обратите внимание:</div>' +
                            'На резервном обходном ключе (для LTE) установлен лимит 15 ГБ. Использование торрентов строго запрещено!' +
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
                window.location.href = cryptoUrl;
                setTimeout(function() {
                    window.location.href = "happ://add/" + subUrl;
                }, 1500);
                return;
            }

            window.location.href = "happ://add/" + subUrl;
            setTimeout(function() { window.location.href = "happ-proxy://add/" + subUrl; }, 150);
            setTimeout(function() { window.location.href = "happ-proxy-utility://add/" + subUrl; }, 300);
            setTimeout(function() { window.location.href = "happ://import/#" + subUrl; }, 450);
            setTimeout(function() { window.location.href = "happ-proxy://import/#" + subUrl; }, 600);
            setTimeout(function() { window.location.href = "happ://yargs?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN"; }, 750);
            setTimeout(function() { window.location.href = "happ://import?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN"; }, 900);
        }

        function importSingBox() {
            if (!hasSub) return;
            window.location.href = "sing-box://import-remote?url=" + encodeURIComponent(subUrl);
        }

        function importShadowrocket() {
            if (!hasSub) return;
            window.location.href = "shadowrocket://add/" + subUrl;
        }

        function importHiddify() {
            if (!hasSub) return;
            window.location.href = "hiddify://import/#" + subUrl;
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
      https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
        console.log(`🔒 SECURE Subscription server running on https://0.0.0.0:${PORT}`);
      });
      return;
    } catch (err) {
      console.error('⚠️ Failed to start secure subscription server, falling back to HTTP:', err.message);
    }
  }

  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Subscription server running on http://0.0.0.0:${PORT}`);
  });
}
