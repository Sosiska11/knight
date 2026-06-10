import express from 'express';
import axios from 'axios';
import https from 'https';
import http from 'http';
import fs from 'fs';
import * as db from './database.js';
import config from './config.js';
import xuiApi from './xui-api.js';
import { reserveNodes } from './cron.js';

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

    // Set Headers for Hiddify, Shadowrocket, Sing-box, etc.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('profile-update-interval', '1');
    // Encode unicode emoji safely for Node.js headers using binary/latin1 encoding
    res.setHeader('Profile-Title', Buffer.from('⚔️ Knight VPN').toString('binary'));
    res.setHeader('Profile-Notice', Buffer.from('⚠️ Резервный профиль (LTE) имеет лимит 15 ГБ. \\n🚫 Торренты строго запрещены! \\n🆘 Поддержка: @knightvpn_help').toString('binary'));
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''KnightVPN");
    
    // Shows traffic usage (1 TB total) and expiration date inside Hiddify
    res.setHeader(
      'Subscription-Userinfo',
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
        { name: 'Госуслуги', sni: 'gosuslugi.ru' },
        { name: 'Сбербанк', sni: 'sberbank.ru' },
        { name: 'Яндекс', sni: 'yandex.ru' },
        { name: 'ВКонтакте', sni: 'vk.com' }
      ];

      for (const bp of sniBypasses) {
        let bypassUrl = sub.bypass_connection_url || sub.connection_url;
        
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
      let countDE = 1;
      let countNL = 1;
      for (const resNode of reserveNodes) {
        let url = resNode.url;
        const newRemark = resNode.country === 'DE' 
          ? `🇩🇪 Германия | Резерв ${countDE++}` 
          : `🇳🇱 Нидерланды | Резерв ${countNL++}`;
        
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

app.get('/import/:uuid', async (req, res) => {
  const { uuid } = req.params;
  const subUrl = `${config.SUB_SERVER_URL}/sub/${uuid}`;

  let cryptoUrl = '';
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

  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Импорт подписки | Knight VPN</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0d0f14;
            --card-bg: rgba(20, 24, 33, 0.6);
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --accent: #10b981;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --border: rgba(255, 255, 255, 0.08);
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
            padding: 20px;
            overflow-x: hidden;
            position: relative;
        }

        /* Ambient glow background */
        body::before {
            content: '';
            position: absolute;
            width: 300px;
            height: 300px;
            background: radial-gradient(circle, rgba(79, 70, 229, 0.2) 0%, transparent 70%);
            top: 20%;
            left: 10%;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 350px;
            height: 350px;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);
            bottom: 15%;
            right: 10%;
            z-index: 0;
            pointer-events: none;
        }

        .container {
            position: relative;
            z-index: 10;
            width: 100%;
            max-width: 460px;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 30px 24px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .logo {
            font-family: 'Outfit', sans-serif;
            font-size: 28px;
            font-weight: 800;
            background: linear-gradient(135deg, #a5b4fc, #818cf8, #4f46e5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
            letter-spacing: -0.5px;
        }

        .status-container {
            margin-bottom: 24px;
        }

        h1 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #ffffff;
        }

        p {
            font-size: 13.5px;
            color: var(--text-muted);
            line-height: 1.5;
        }

        .client-list {
            margin-bottom: 20px;
        }

        .client-card {
            display: flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 14px 16px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: left;
        }

        .client-card:hover {
            background: rgba(255, 255, 255, 0.07);
            border-color: var(--primary);
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(79, 70, 229, 0.15);
        }

        .client-card:active {
            transform: translateY(0);
        }

        .client-icon {
            font-size: 24px;
            margin-right: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
        }

        .client-info {
            flex: 1;
        }

        .client-info h3 {
            font-size: 14.5px;
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 2px;
        }

        .client-info p {
            font-size: 11px;
            color: var(--text-muted);
            margin-bottom: 0;
            line-height: 1.4;
        }

        .client-arrow {
            font-size: 13px;
            color: var(--primary);
            font-weight: bold;
            opacity: 0.6;
            transition: opacity 0.2s;
        }

        .client-card:hover .client-arrow {
            opacity: 1;
        }

        .btn-secondary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 14px 24px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-main);
            font-size: 14px;
            font-weight: 600;
            border: 1px solid var(--border);
            border-radius: 14px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.25s ease;
            box-shadow: none;
            margin-bottom: 16px;
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
        }

        .divider {
            height: 1px;
            background: var(--border);
            margin: 24px 0;
            position: relative;
        }

        .divider::after {
            content: 'или';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #141821;
            padding: 0 12px;
            color: var(--text-muted);
            font-size: 12px;
        }

        .download-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-muted);
            margin-bottom: 14px;
            font-weight: 600;
        }

        .download-links {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .download-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text-main);
            font-size: 12.5px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .download-btn:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.12);
        }

        .footer-note {
            font-size: 11px;
            color: #4b5563;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">⚔️ Knight VPN</div>
        
        <div class="status-container">
            <h1>Импорт подписки</h1>
            <p>Выберите ваш клиент для автоматического импорта ключа:</p>
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 12px; margin-top: 15px; font-size: 12px; color: #fca5a5; line-height: 1.4; text-align: left;">
                ⚠️ <b>Внимание:</b> На резервном обходном ключе (для LTE) установлен лимит трафика 15 ГБ. Использование торрентов строго запрещено!
            </div>
        </div>

        <div class="client-list">
            <!-- Happ Card (Primary) -->
            <div class="client-card" onclick="importHapp()">
                <div class="client-icon">🍏</div>
                <div class="client-info">
                    <h3>Happ (Рекомендуется)</h3>
                    <p>Импорт для iOS & Apple Silicon macOS</p>
                </div>
                <div class="client-arrow">⚡️</div>
            </div>

            <!-- Sing-box Card -->
            <div class="client-card" onclick="importSingBox()">
                <div class="client-icon">🤖</div>
                <div class="client-info">
                    <h3>Sing-box</h3>
                    <p>Импорт для Android, Windows, macOS</p>
                </div>
                <div class="client-arrow">⚡️</div>
            </div>

            <!-- Shadowrocket Card -->
            <div class="client-card" onclick="importShadowrocket()">
                <div class="client-icon">🚀</div>
                <div class="client-info">
                    <h3>Shadowrocket</h3>
                    <p>Альтернативный импорт для iOS/macOS</p>
                </div>
                <div class="client-arrow">⚡️</div>
            </div>

            <!-- Hiddify Card -->
            <div class="client-card" onclick="importHiddify()">
                <div class="client-icon">🔗</div>
                <div class="client-info">
                    <h3>Hiddify</h3>
                    <p>Импорт во все совместимые версии</p>
                </div>
                <div class="client-arrow">⚡️</div>
            </div>
        </div>

        <button onclick="copySubUrl()" class="btn-secondary">📋 Скопировать ссылку вручную</button>

        <div class="divider"></div>

        <div class="download-title">Еще не установили приложение?</div>
        <div class="download-links">
            <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" class="download-btn">🍏 Скачать Happ</a>
            <a href="https://play.google.com/store/apps/details?id=io.nekohasekai.sfa" target="_blank" class="download-btn">🤖 Скачать Sing-box</a>
        </div>

        <div class="footer-note">
            При первом запуске разрешите браузеру открыть приложение.
        </div>
    </div>

    <script>
        const subUrl = "${subUrl}";
        const cryptoUrl = "${cryptoUrl}";

        function importHapp() {
            if (cryptoUrl) {
                window.location.href = cryptoUrl;
                // Fallback to direct add if the encrypted link doesn't trigger anything after 1.5s
                setTimeout(function() {
                    window.location.href = "happ://add/" + subUrl;
                }, 1500);
                return;
            }

            // iOS Happ Direct Link (Primary Option)
            window.location.href = "happ://add/" + subUrl;

            // Alternative schemes with delay
            setTimeout(function() {
                window.location.href = "happ-proxy://add/" + subUrl;
            }, 150);

            setTimeout(function() {
                window.location.href = "happ-proxy-utility://add/" + subUrl;
            }, 300);

            setTimeout(function() {
                window.location.href = "happ://import/#" + subUrl;
            }, 450);

            setTimeout(function() {
                window.location.href = "happ-proxy://import/#" + subUrl;
            }, 600);

            setTimeout(function() {
                window.location.href = "happ://yargs?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN";
            }, 750);
            
            setTimeout(function() {
                window.location.href = "happ://import?url=" + encodeURIComponent(subUrl) + "&name=KnightVPN";
            }, 900);
        }

        function importSingBox() {
            window.location.href = "sing-box://import-remote?url=" + encodeURIComponent(subUrl);
        }

        function importShadowrocket() {
            window.location.href = "shadowrocket://add/" + subUrl;
        }

        function importHiddify() {
            window.location.href = "hiddify://import/#" + subUrl;
        }

        // Auto-attempt to open Happ on page load
        window.onload = function() {
            setTimeout(function() {
                importHapp();
            }, 600);
        };

        function copySubUrl() {
            navigator.clipboard.writeText(subUrl).then(function() {
                alert('Ссылка подписки успешно скопирована!');
            }, function(err) {
                const el = document.createElement('textarea');
                el.value = subUrl;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                alert('Ссылка подписки скопирована!');
            });
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
