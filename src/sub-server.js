import express from 'express';
import * as db from './database.js';
import config from './config.js';

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
    res.setHeader('Profile-Title', 'Knight VPN');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''KnightVPN");
    
    // Shows traffic usage (1 TB total) and expiration date inside Hiddify
    res.setHeader(
      'Subscription-Userinfo',
      `upload=0; download=0; total=1099511627776; expire=${expireTimestamp}`
    );

    // Base64 encode the connection URL (standard format for V2Ray subscriptions)
    const base64Config = Buffer.from(sub.connection_url + '\n').toString('base64');
    
    res.send(base64Config);
  } catch (error) {
    console.error('Subscription server error:', error);
    res.status(500).send('Internal server error.');
  }
});

export function startSubServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Subscription server running on http://0.0.0.0:${PORT}`);
  });
}
