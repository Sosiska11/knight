import axios from 'axios';
import crypto from 'crypto';
import { exec } from 'child_process';
import config from './config.js';
import * as slaveSync from './slave-sync.js';

function getBypassUuid(mainUuid) {
  const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

class XuiClient {
  constructor() {
    this.baseUrl = config.XUI_URL ? config.XUI_URL.replace(/\/+$/, '') : '';
    this.username = config.XUI_USERNAME;
    this.password = config.XUI_PASSWORD;
    this.mockMode = config.MOCK_XUI;
    this.cookie = null;
    this.csrfToken = null;
    this.sessionExpiry = null;
    this.offlineNodes = new Set();
    this.hy2ObfsCache = null;
    this.hy2ObfsCacheAt = 0;
    this.HY2_OBFS_CACHE_TTL = 10 * 60 * 1000;
    this.publicHost = '144.31.196.245'; // Direct IP to bypass domain blocking
  }

  // Helper to check if session is still valid
  isLoggedIn() {
    return this.cookie && this.csrfToken && this.sessionExpiry && Date.now() < this.sessionExpiry;
  }

  triggerTuicSync() {
    exec('python3 /root/sync_tuic.py', (err, stdout, stderr) => {
      if (err) console.error('⚠️ TUIC sync failed:', err.message);
      else console.log('✅ TUIC sync triggered successfully.');
    });
  }

  // Authenticate with 3x-ui panel
  async login() {
    if (this.mockMode) return true;

    try {
      console.log(`🔑 Attempting login to 3x-ui panel: ${this.baseUrl}`);
      
      // 1. GET request to the root page to obtain initial session cookie and CSRF token
      const getResponse = await axios.get(`${this.baseUrl}/`, {
        timeout: 15000,
        validateStatus: () => true
      });

      if (getResponse.status !== 200) {
        throw new Error(`Failed to load panel root page. Status: ${getResponse.status}`);
      }

      // Extract cookie
      const getCookies = getResponse.headers['set-cookie'];
      if (getCookies && getCookies.length > 0) {
        this.cookie = getCookies.map(c => c.split(';')[0]).join('; ');
      }

      // Extract CSRF token from meta tags
      const csrfMatch = getResponse.data.match(/meta name="csrf-token" content="([^"]+)"/);
      this.csrfToken = csrfMatch ? csrfMatch[1] : null;

      if (!this.csrfToken) {
        console.warn('⚠️ CSRF token meta tag not found in login page HTML.');
      }

      // 2. POST request to login (JSON format) with Cookie and CSRF token
      const loginUrl = `${this.baseUrl}/login`;
      const response = await axios.post(
        loginUrl,
        { username: this.username, password: this.password },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': this.cookie || '',
            'X-CSRF-Token': this.csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      if (response.status === 200 && response.data?.success) {
        // Extract authenticated session cookie
        const cookies = response.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
          this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
          this.sessionExpiry = Date.now() + 45 * 60 * 1000;
          console.log('✅ Successfully authenticated with 3x-ui panel.');
          return true;
        }
      }

      // Try urlencoded as fallback if JSON failed
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);

      const urlencodedResponse = await axios.post(loginUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': this.cookie || '',
          'X-CSRF-Token': this.csrfToken || '',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      if (urlencodedResponse.status === 200 && urlencodedResponse.data?.success) {
        const cookies = urlencodedResponse.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
          this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
          this.sessionExpiry = Date.now() + 45 * 60 * 1000;
          console.log('✅ Successfully authenticated with 3x-ui panel (via urlencoded fallback).');
          return true;
        }
      }

      throw new Error(`Invalid credentials or unexpected response structure. Status: ${response.status}`);
    } catch (error) {
      console.error('❌ 3x-ui Login failed:', error.message);
      // Fallback to mock mode only if configured, otherwise allow retries next time
      if (config.MOCK_XUI) {
        console.warn('⚠️ Switching to MOCK MODE due to connection failure.');
        this.mockMode = true;
      }
      return false;
    }
  }

  // Ensure login and get headers
  async getHeaders() {
    if (!this.isLoggedIn()) {
      await this.login();
    }
    return {
      'Cookie': this.cookie,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': this.csrfToken || '',
      'X-Requested-With': 'XMLHttpRequest'
    };
  }

  // Get single Inbound details
  async getInbound(inboundId) {
    if (this.mockMode) return null;

    try {
      const headers = await this.getHeaders();
      if (this.mockMode) return null;
      const url = `${this.baseUrl}/panel/api/inbounds/get/${inboundId}`;
      const response = await axios.get(url, { headers, timeout: 5000 });

      if (response.data && response.data.success) {
        return response.data.obj;
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to fetch inbound ${inboundId}:`, error.message);
      return null;
    }
  }

  // Add client to inbound
  async addClient(email, uuid = crypto.randomUUID(), limitIp = config.XUI_LIMIT_IP) {
    const inboundId = config.XUI_INBOUND_ID;
    const bypassInboundId = config.XUI_BYPASS_INBOUND_ID;
    const bypassUuid = getBypassUuid(uuid);

    if (this.mockMode) {
      console.log(`[MOCK] Added client: email=${email}, uuid=${uuid}`);
      // Generate a mock Reality link
      const mockLink = `vless://${uuid}@your-server.com:443?encryption=none&type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=yahoo.com&sid=mockShortId&flow=xtls-rprx-vision#🇩🇪 Германия`;
      const mockBypassLink = `vless://${bypassUuid}@your-server.com:443?encryption=none&type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=ya.ru&sid=mockShortId&flow=xtls-rprx-vision#🇷🇺 LTE | Обходка`;
      return { email, uuid, connectionUrl: mockLink, bypassConnectionUrl: mockBypassLink };
    }

    // Clean up any existing client with the same email to avoid collisions (e.g. after database resets)
    try {
      console.log(`🧹 Cleaning up any pre-existing client with email: ${email}`);
      await this.deleteClient(email, uuid);
    } catch (err) {
      // Ignore error if the client did not exist
    }

    try {
      const headers = await this.getHeaders();
      if (this.mockMode) return this.addClient(email, uuid);

      // 1. Add to Main Inbound
      const mainPayload = {
        inboundIds: [inboundId],
        client: {
          id: uuid,
          flow: 'xtls-rprx-vision',
          email: email,
          limitIp: limitIp,
          totalGB: 0,
          expiryTime: 0,
          enable: true,
          tgId: 0,
          subId: '',
          comment: ''
        }
      };

      const url = `${this.baseUrl}/panel/api/clients/add`;
      const response = await axios.post(url, mainPayload, { headers, timeout: 10000 });

      if (!response.data || !response.data.success) {
        throw new Error(`Main inbound error: ${response.data?.msg || 'Unknown error'}`);
      }

      console.log(`✅ Client ${email} added in 3x-ui to main inbound.`);

      // 2. Add to Bypass Inbound
      let addedBypass = false;
      if (bypassInboundId) {
        let bypassFlow = 'xtls-rprx-vision';
        try {
          const bpInbound = await this.getInbound(bypassInboundId);
          if (bpInbound) {
            const bpStreamSettings = typeof bpInbound.streamSettings === 'string'
              ? JSON.parse(bpInbound.streamSettings)
              : bpInbound.streamSettings;
            if (bpStreamSettings.network === 'grpc') {
              bypassFlow = '';
            }
          }
        } catch (err) {
          console.warn('⚠️ Failed to fetch bypass inbound details for flow selection:', err.message);
        }

        const bypassPayload = {
          inboundIds: [bypassInboundId],
          client: {
            id: bypassUuid,
            flow: bypassFlow,
            email: email + '_bp',
            limitIp: limitIp,
            totalGB: config.XUI_BYPASS_LIMIT_GB > 0 ? config.XUI_BYPASS_LIMIT_GB * 1024 * 1024 * 1024 : 0,
            expiryTime: 0,
            enable: true,
            tgId: 0,
            subId: '',
            comment: 'Bypass emergency profile'
          }
        };

        try {
          const bypassResponse = await axios.post(url, bypassPayload, { headers, timeout: 10000 });
          if (bypassResponse.data && bypassResponse.data.success) {
            console.log(`✅ Client ${email} added in 3x-ui to bypass inbound.`);
            addedBypass = true;
          } else {
            console.warn(`⚠️ Failed to add client to bypass inbound: ${bypassResponse.data?.msg || 'Unknown panel error'}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to add client to bypass inbound due to request error:`, err.message);
        }
      }

      // 3. Add to CDN Inbound
      if (config.XUI_CDN_INBOUND_ID) {
        const cdnPayload = {
          inboundIds: [config.XUI_CDN_INBOUND_ID],
          client: {
            id: bypassUuid,
            flow: '',
            email: email + '_cdn',
            limitIp: limitIp,
            totalGB: config.XUI_BYPASS_LIMIT_GB > 0 ? config.XUI_BYPASS_LIMIT_GB * 1024 * 1024 * 1024 : 0,
            expiryTime: 0,
            enable: true,
            tgId: 0,
            subId: '',
            comment: 'Bypass CDN XHTTP profile'
          }
        };

        try {
          const cdnResponse = await axios.post(url, cdnPayload, { headers, timeout: 10000 });
          if (cdnResponse.data && cdnResponse.data.success) {
            console.log(`✅ Client ${email} added in 3x-ui to CDN inbound.`);
            addedBypass = true; // Mark as added to at least one bypass inbound
          } else {
            console.warn(`⚠️ Failed to add client to CDN inbound: ${cdnResponse.data?.msg || 'Unknown panel error'}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to add client to CDN inbound due to request error:`, err.message);
        }
      }

      // 4. Add to Hysteria 2 Inbound
      if (config.XUI_HY2_INBOUND_ID) {
        const hy2Payload = {
          inboundIds: [config.XUI_HY2_INBOUND_ID],
          client: {
            id: uuid,
            auth: uuid,
            password: uuid,
            email: email + '_hy2',
            limitIp: limitIp,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: 0,
            subId: '',
            comment: 'Hysteria 2 NL profile'
          }
        };

        try {
          const hy2Response = await axios.post(url, hy2Payload, { headers, timeout: 10000 });
          if (hy2Response.data && hy2Response.data.success) {
            console.log(`✅ Client ${email} added in 3x-ui to Hysteria 2 inbound.`);
          } else {
            console.warn(`⚠️ Failed to add client to Hysteria 2 inbound: ${hy2Response.data?.msg || 'Unknown panel error'}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to add client to Hysteria 2 inbound due to request error:`, err.message);
        }
      }

      // 5. Add to VLESS CDN (Cloudflare) Inbound
      if (config.XUI_VLESS_CDN_INBOUND_ID) {
        const vlessCdnPayload = {
          inboundIds: [config.XUI_VLESS_CDN_INBOUND_ID],
          client: {
            id: uuid,
            flow: '',
            email: email + '_cf',
            limitIp: limitIp,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: 0,
            subId: '',
            comment: 'VLESS CDN (Cloudflare) profile'
          }
        };

        try {
          const vlessCdnResponse = await axios.post(url, vlessCdnPayload, { headers, timeout: 10000 });
          if (vlessCdnResponse.data && vlessCdnResponse.data.success) {
            console.log(`✅ Client ${email} added in 3x-ui to VLESS CDN inbound.`);
          } else {
            console.warn(`⚠️ Failed to add client to VLESS CDN inbound: ${vlessCdnResponse.data?.msg || 'Unknown panel error'}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to add client to VLESS CDN inbound due to request error:`, err.message);
        }
      }

      // Attempt to build the Reality links automatically
      const connectionUrl = await this.buildRealityLink(inboundId, uuid, email);
      let bypassConnectionUrl = null;
      if (config.XUI_CDN_INBOUND_ID && addedBypass) {
        bypassConnectionUrl = this.buildXhttpLink(bypassUuid);
      } else if (bypassInboundId && addedBypass) {
        bypassConnectionUrl = await this.buildRealityLink(bypassInboundId, bypassUuid, email);
      }

      // Push new client to NL slave VPS (managed via slave-sync.js, fire-and-forget)
      try { slaveSync.noteClientAdd(email); } catch (e) { console.warn('⚠️ slave-sync noteClientAdd failed:', e.message); }

      this.triggerTuicSync();

      return { email, uuid, connectionUrl, bypassConnectionUrl };
    } catch (error) {
      console.error(`❌ Failed to add client ${email} in 3x-ui:`, error.message);
      // Generate fallback key so user gets SOMETHING and we can debug
const mockLink = `vless://${uuid}@your-server.com:443?encryption=none&type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=yahoo.com&sid=mockShortId&flow=xtls-rprx-vision#🇩🇪 Германия`;
      const mockBypassLink = `vless://${bypassUuid}@your-server.com:443?encryption=none&type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=ya.ru&sid=mockShortId&flow=xtls-rprx-vision#🇷🇺 LTE | Обходка`;
    }
  }

  // Delete client from inbound
  async deleteClient(email, uuid) {
    if (this.mockMode) {
      console.log(`[MOCK] Deleted client: email=${email}, uuid=${uuid}`);
      return true;
    }

    try {
      const headers = await this.getHeaders();
      if (this.mockMode) return true;
      
      // Try MHSanaei 3.x.x endpoint first: /panel/api/clients/del/{email}
      let url = `${this.baseUrl}/panel/api/clients/del/${encodeURIComponent(email)}`;
      let bypassUrl = `${this.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_bp')}`;
      let cdnUrl = `${this.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_cdn')}`;
      let hy2Url = `${this.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_hy2')}`;
      let vlessCdnUrl = `${this.baseUrl}/panel/api/clients/del/${encodeURIComponent(email + '_cf')}`;
      console.log(`🗑️ Attempting to delete client ${email}, bypass, CDN, Hysteria 2 and VLESS CDN client...`);
      
      let response = await axios.post(url, {}, { headers, timeout: 5000, validateStatus: () => true });
      await axios.post(bypassUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(() => null);
      await axios.post(cdnUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(() => null);
      await axios.post(hy2Url, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(() => null);
      await axios.post(vlessCdnUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(() => null);

      // If first delete method returned 200 but failed, check if client was simply not found
      if (response.status === 200 && response.data && !response.data.success) {
        const msg = response.data.msg || '';
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not exist')) {
          console.log(`✅ Client ${email} was not found on 3x-ui panel, considering it deleted.`);
          return true;
        }
      }

      // If it fails or returns 404/405, try the older MHSanaei / FranzKafka endpoints as fallbacks
      if (response.status !== 200 || !response.data?.success) {
        console.warn(`⚠️ First delete method failed (${response.status}). Trying alternative...`);
        const inboundId = config.XUI_INBOUND_ID;
        url = `${this.baseUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
        response = await axios.post(url, {}, { headers, timeout: 5000, validateStatus: () => true });

        // If bypass inbound is configured, clean it up as well
        if (config.XUI_BYPASS_INBOUND_ID) {
          const bypassUuid = getBypassUuid(uuid);
          const bypassUrl = `${this.baseUrl}/panel/api/inbounds/${config.XUI_BYPASS_INBOUND_ID}/delClient/${bypassUuid}`;
          await axios.post(bypassUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(err => {
            console.warn(`⚠️ Failed to delete client from bypass inbound:`, err.message);
          });
        }

        // If CDN inbound is configured, clean it up as well
        if (config.XUI_CDN_INBOUND_ID) {
          const bypassUuid = getBypassUuid(uuid);
          const cdnUrl = `${this.baseUrl}/panel/api/inbounds/${config.XUI_CDN_INBOUND_ID}/delClient/${bypassUuid}`;
          await axios.post(cdnUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(err => {
            console.warn(`⚠️ Failed to delete client from CDN inbound:`, err.message);
          });
        }

        // If Hysteria 2 inbound is configured, clean it up as well
        if (config.XUI_HY2_INBOUND_ID) {
          const hy2Url = `${this.baseUrl}/panel/api/inbounds/${config.XUI_HY2_INBOUND_ID}/delClient/${uuid}`;
          await axios.post(hy2Url, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(err => {
            console.warn(`⚠️ Failed to delete client from Hysteria 2 inbound:`, err.message);
          });
        }

        // If VLESS CDN (Cloudflare) inbound is configured, clean it up as well
        if (config.XUI_VLESS_CDN_INBOUND_ID) {
          const vlessCdnUrl = `${this.baseUrl}/panel/api/inbounds/${config.XUI_VLESS_CDN_INBOUND_ID}/delClient/${uuid}`;
          await axios.post(vlessCdnUrl, {}, { headers, timeout: 5000, validateStatus: () => true }).catch(err => {
            console.warn(`⚠️ Failed to delete client from VLESS CDN inbound:`, err.message);
          });
        }
      }

      if (response.status === 200 && response.data?.success) {
        console.log(`✅ Client ${email} deleted from 3x-ui.`);
        // Push deletion to NL slave VPS
        try { slaveSync.noteClientDelete(email); } catch (e) { console.warn('⚠️ slave-sync noteClientDelete failed:', e.message); }
        this.triggerTuicSync();
        return true;
      }

      // If fallback response status is 404 or it failed because of "not found" / "not exist"
      if (response.status === 404) {
        console.log(`✅ Client ${email} was not found (404) in fallback delete method, considering it deleted.`);
        try { slaveSync.noteClientDelete(email); } catch (e) { console.warn('⚠️ slave-sync noteClientDelete failed:', e.message); }
        this.triggerTuicSync();
        return true;
      }
      if (response.data && !response.data.success) {
        const msg = response.data.msg || '';
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not exist')) {
          console.log(`✅ Client ${email} not found in fallback delete method, considering it deleted.`);
          try { slaveSync.noteClientDelete(email); } catch (e) { console.warn('⚠️ slave-sync noteClientDelete failed:', e.message); }
          this.triggerTuicSync();
          return true;
        }
      }

      throw new Error(response.data?.msg || `HTTP status ${response.status}`);
    } catch (error) {
      console.error(`❌ Failed to delete client ${email} in 3x-ui:`, error.message);
      return false;
    }
  }

  // Construct Reality connection URL from Inbound configuration
  async buildRealityLink(inboundId, uuid, email) {
    const inbound = await this.getInbound(inboundId);
    
    // Choose appropriate remark
    const remark = email.endsWith('_bp')
      ? '🇷🇺 LTE | Обходка'
      : '🇩🇪 Германия';

    if (!inbound) {
      // Fallback if we can't fetch inbound settings
      const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
      return `vless://${uuid}@${domain}:443?type=tcp&security=reality&fp=chrome#${remark}`;
    }

    try {
      const port = inbound.port;
      const streamSettings = typeof inbound.streamSettings === 'string'
        ? JSON.parse(inbound.streamSettings)
        : inbound.streamSettings;
      
      if (streamSettings.security !== 'reality') {
        // Fallback for non-reality
        const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
        return `vless://${uuid}@${domain}:${port}?encryption=none&type=tcp&security=none#${remark}`;
      }

      const type = streamSettings.network || 'tcp';
      const reality = streamSettings.realitySettings;
      const publicKey = reality.publicKey || reality.settings?.publicKey;
      const shortId = reality.shortIds?.[0] || '';
      const sni = reality.serverNames?.[0] || 'yahoo.com';
      const fp = reality.fingerprint || reality.settings?.fingerprint || 'chrome';
      const spiderX = reality.settings?.spiderX || reality.spiderX || '';

      // Use direct IP instead of domain name to bypass DNS-level domain blocking
      let host = this.publicHost;
      
      let link = `vless://${uuid}@${host}:${port === 7443 ? 3000 : port}?encryption=none&type=${type}&security=reality&pbk=${publicKey}&fp=${fp}&sni=${sni}&sid=${shortId}`;
      
      if (spiderX) {
        link += `&spx=${encodeURIComponent(spiderX)}`;
      }
      
      if (type === 'tcp') {
        link += `&flow=xtls-rprx-vision`;
      } else if (type === 'grpc') {
        const serviceName = streamSettings.grpcSettings?.serviceName || 'grpc';
        link += `&serviceName=${serviceName}`;
      } else if (type === 'xhttp') {
        const xhttpSettings = streamSettings.xhttpSettings || {};
        const path = encodeURIComponent(xhttpSettings.path || '/download');
        const mode = xhttpSettings.mode || 'packet-up';
        const xhttpHost = xhttpSettings.host || sni;
        link += `&host=${xhttpHost}&path=${path}&mode=${mode}`;
      }
      
      link += `#${remark}`;
      return link;
    } catch (err) {
      console.error('❌ Error parsing inbound settings to build link:', err);
      const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
      return `vless://${uuid}@${domain}:443?encryption=none&type=tcp&security=reality&fp=chrome#${remark}`;
    }
  }

  async buildHysteria2Link(uuid, customHost = null, customRemark = null) {
    const defaultHost = this.publicHost;
    let host = customHost || defaultHost;
    let port = config.HY2_PORT || 46352;
    let extraParams = '';
    if (host === '31.76.46.20' || host === 'fi.node-ping-stat.ru' || host === process.env.FI_SSH_HOST) {
      port = 443;
    } else if (host === '194.50.94.46' || host === process.env.NL_SSH_HOST) {
      // NL is relayed via Finland (mport 10000-15000) — direct NL UDP is blocked by TSPU
      host = '31.76.46.20';
      port = 10000;
      extraParams = '&mport=10000-15000';
    } else if (host === '144.31.196.245' || host === 'sub.knight1.space' || host === defaultHost) {
      host = '31.76.46.20';
      port = 20000;
      extraParams = '&mport=20000-50000';
    }
    // Use sub.knight1.space as SNI for all nodes
    const sni = 'sub.knight1.space';
    const remark = customRemark || '🇩🇪 Германия | Hysteria 2';

    if (this.hy2ObfsCache === null || (this.hy2ObfsCacheAt && Date.now() - this.hy2ObfsCacheAt > this.HY2_OBFS_CACHE_TTL)) {
      if (config.XUI_HY2_INBOUND_ID) {
        try {
          const inbound = await this.getInbound(config.XUI_HY2_INBOUND_ID);
          if (inbound) {
            const streamSettings = typeof inbound.streamSettings === 'string'
              ? JSON.parse(inbound.streamSettings)
              : inbound.streamSettings;
            const finalmask = streamSettings?.finalmask;
            if (finalmask && finalmask.udp && finalmask.udp.length > 0) {
              const udpMask = finalmask.udp[0];
              if (udpMask.type && udpMask.settings && udpMask.settings.password) {
                this.hy2ObfsCache = `&obfs=${udpMask.type}&obfs-password=${udpMask.settings.password}`;
                console.log(`ℹ️ Cached Hysteria 2 obfuscation parameters: ${this.hy2ObfsCache}`);
              } else {
                this.hy2ObfsCache = '';
                console.log('ℹ️ Hysteria 2 inbound has no obfs (no type/password). Subscription links will be plain.');
              }
            } else {
              this.hy2ObfsCache = '';
              console.log('ℹ️ Hysteria 2 inbound has no finalmask/udp. Subscription links will be plain.');
            }
          } else {
            this.hy2ObfsCache = '';
          }
          this.hy2ObfsCacheAt = Date.now();
        } catch (err) {
          console.error('❌ Failed to fetch Hysteria 2 inbound settings for caching:', err.message);
          // Do not cache failure permanently so we can retry later
        }
      } else {
        this.hy2ObfsCache = '';
        this.hy2ObfsCacheAt = Date.now();
      }
    }

    const obfsParams = this.hy2ObfsCache || '';
    return `hysteria2://${uuid}@${host}:${port}?sni=${sni}&alpn=h3${extraParams}${obfsParams}#${remark}`;
  }

  buildXhttpLink(bypassUuid) {
    const host = config.CDN_DOMAIN || 'cdn.node-ping-stat.ru';
    const xhttpPath = encodeURIComponent((config.XHTTP_PATH || '/knight-down').replace(/\/+$/, ''));
    const xhttpMode = config.XHTTP_MODE || 'packet-up';
    const remark = '🇩🇪 Германия | CDN (XHTTP)';
    const extraObj = {
      xPaddingBytes: "100-1000",
      scMaxEachPostBytes: "100000-1000000",
      scMinPostsIntervalMs: "10-30",
      scMaxBufferedPosts: 30,
      noGRPCHeader: false
    };
    const extra = encodeURIComponent(JSON.stringify(extraObj));
    return `vless://${bypassUuid}@${host}:443?encryption=none&type=xhttp&security=tls&sni=${host}&host=${host}&path=${xhttpPath}&mode=${xhttpMode}&extra=${extra}#${remark}`;
  }

  buildXhttpDirectLink(bypassUuid) {
    const host = this.publicHost;
    const port = 3000;
    const sni = 'sub.knight1.space';
    const xhttpPath = encodeURIComponent('/knight-down');
    const xhttpMode = config.XHTTP_MODE || 'packet-up';
    const remark = '🇩🇪 Германия | Обходной (XHTTP)';
    const extraObj = {
      xPaddingBytes: "100-1000",
      scMaxEachPostBytes: "100000-1000000",
      scMinPostsIntervalMs: "10-30",
      scMaxBufferedPosts: 30,
      noGRPCHeader: false
    };
    const extra = encodeURIComponent(JSON.stringify(extraObj));
    return `vless://${bypassUuid}@${host}:${port}?encryption=none&type=xhttp&security=tls&sni=${sni}&host=${sni}&path=${xhttpPath}&mode=${xhttpMode}&extra=${extra}#${remark}`;
  }

  // Get active client IPs
  async getClientIps(email) {
    if (this.mockMode) {
      return ['127.0.0.1'];
    }

    try {
      const headers = await this.getHeaders();
      const url = `${this.baseUrl}/panel/api/clients/ips/${email}`;
      const response = await axios.post(url, {}, { headers, timeout: 5000 });

      if (response.data && response.data.success) {
        const obj = response.data.obj;
        if (Array.isArray(obj)) {
          return obj;
        } else if (typeof obj === 'string') {
          if (obj === 'No IP Record') return [];
          return obj.split(',').map(ip => ip.trim()).filter(Boolean);
        }
      }
      return [];
    } catch (error) {
      console.error(`❌ Failed to get client IPs for ${email}:`, error.message);
      return [];
    }
  }

  // Get list of all nodes
  async getNodes() {
    if (this.mockMode) return [];

    try {
      const headers = await this.getHeaders();
      const url = `${this.baseUrl}/panel/api/nodes/list`;
      const response = await axios.get(url, { headers, timeout: 5000 });

      if (response.data && response.data.success) {
        return response.data.obj || [];
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to fetch nodes:', error.message);
      return [];
    }
  }

  markNodeOffline(address) {
    this.offlineNodes.add(address);
  }

  markNodeOnline(address) {
    this.offlineNodes.delete(address);
  }

  isNodeOffline(address) {
    return this.offlineNodes.has(address);
  }

  isConfigSecure(url) {
    if (!url) return true;
    const insecurePattern = /[?&;](allowinsecure|allow_insecure|insecure)=(1|true|yes)/i;
    return !insecurePattern.test(url);
  }
}

export default new XuiClient();
