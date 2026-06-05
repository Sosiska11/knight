import axios from 'axios';
import crypto from 'crypto';
import config from './config.js';

class XuiClient {
  constructor() {
    this.baseUrl = config.XUI_URL ? config.XUI_URL.replace(/\/+$/, '') : '';
    this.username = config.XUI_USERNAME;
    this.password = config.XUI_PASSWORD;
    this.mockMode = config.MOCK_XUI;
    this.cookie = null;
    this.csrfToken = null;
    this.sessionExpiry = null;
  }

  // Helper to check if session is still valid
  isLoggedIn() {
    return this.cookie && this.csrfToken && this.sessionExpiry && Date.now() < this.sessionExpiry;
  }

  // Authenticate with 3x-ui panel
  async login() {
    if (this.mockMode) return true;

    try {
      console.log(`🔑 Attempting login to 3x-ui panel: ${this.baseUrl}`);
      
      // 1. GET request to the root page to obtain initial session cookie and CSRF token
      const getResponse = await axios.get(`${this.baseUrl}/`, {
        timeout: 5000,
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
      // Fallback to mock mode so bot doesn't crash
      console.warn('⚠️ Switching to MOCK MODE due to connection failure.');
      this.mockMode = true;
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
  async addClient(email, uuid = crypto.randomUUID()) {
    const inboundId = config.XUI_INBOUND_ID;
    const limitIp = config.XUI_LIMIT_IP;

    if (this.mockMode) {
      console.log(`[MOCK] Added client: email=${email}, uuid=${uuid}`);
      // Generate a mock Reality link
      const mockLink = `vless://${uuid}@your-server.com:443?type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=yahoo.com&sid=mockShortId&flow=xtls-rprx-vision#🇳🇱 Knight VPN | Netherlands`;
      return { email, uuid, connectionUrl: mockLink };
    }

    try {
      const headers = await this.getHeaders();
      if (this.mockMode) return this.addClient(email, uuid);
      const clientPayload = {
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
      const response = await axios.post(url, clientPayload, { headers, timeout: 10000 });

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.msg || 'Unknown panel error');
      }

      console.log(`✅ Client ${email} added in 3x-ui.`);

      // Attempt to build the Reality link automatically
      const connectionUrl = await this.buildRealityLink(inboundId, uuid, email);
      return { email, uuid, connectionUrl };
    } catch (error) {
      console.error(`❌ Failed to add client ${email} in 3x-ui:`, error.message);
      // Generate fallback key so user gets SOMETHING and we can debug
      const mockLink = `vless://${uuid}@your-server.com:443?type=tcp&security=reality&pbk=mockPrivateKeyHere&fp=chrome&sni=yahoo.com&sid=mockShortId&flow=xtls-rprx-vision#🇳🇱 Knight VPN | Netherlands`;
      return { email, uuid, connectionUrl: mockLink, error: error.message };
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
      console.log(`🗑️ Attempting to delete client ${email} using URL: ${url}`);
      
      let response = await axios.post(url, {}, { headers, timeout: 5000, validateStatus: () => true });

      // If it fails or returns 404/405, try the older MHSanaei / FranzKafka endpoints as fallbacks
      if (response.status !== 200 || !response.data?.success) {
        console.warn(`⚠️ First delete method failed (${response.status}). Trying alternative...`);
        const inboundId = config.XUI_INBOUND_ID;
        url = `${this.baseUrl}/panel/api/inbounds/${inboundId}/delClient/${uuid}`;
        response = await axios.post(url, {}, { headers, timeout: 5000, validateStatus: () => true });
      }

      if (response.status === 200 && response.data?.success) {
        console.log(`✅ Client ${email} deleted from 3x-ui.`);
        return true;
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
    if (!inbound) {
      // Fallback if we can't fetch inbound settings
      const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
      return `vless://${uuid}@${domain}:443?type=tcp&security=reality&fp=chrome#🇳🇱 Knight VPN | Netherlands`;
    }

    try {
      const port = inbound.port;
      const remark = `🇳🇱 Knight VPN | Netherlands`;
      const streamSettings = typeof inbound.streamSettings === 'string'
        ? JSON.parse(inbound.streamSettings)
        : inbound.streamSettings;
      
      if (streamSettings.security !== 'reality') {
        // Fallback for non-reality
        const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
        return `vless://${uuid}@${domain}:${port}?type=tcp&security=none#${remark}`;
      }

      const reality = streamSettings.realitySettings;
      const publicKey = reality.publicKey || reality.settings?.publicKey;
      const shortId = reality.shortIds?.[0] || '';
      const sni = reality.serverNames?.[0] || 'yahoo.com';
      const fp = reality.fingerprint || reality.settings?.fingerprint || 'chrome';

      // Parse domain from baseUrl or use IP
      let host = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
      
      // If the panel has an external IP or domain set in inbound, we could use that, 
      // but otherwise the host of the panel is the most reliable server IP.
      const link = `vless://${uuid}@${host}:${port}?type=tcp&security=reality&pbk=${publicKey}&fp=${fp}&sni=${sni}&sid=${shortId}&flow=xtls-rprx-vision#${remark}`;
      return link;
    } catch (err) {
      console.error('❌ Error parsing inbound settings to build link:', err);
      const domain = this.baseUrl.replace(/https?:\/\//, '').split(':')[0];
      return `vless://${uuid}@${domain}:443?type=tcp&security=reality&fp=chrome#🇳🇱 Knight VPN | Netherlands`;
    }
  }
}

export default new XuiClient();
