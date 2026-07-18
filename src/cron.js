import cron from 'node-cron';
import net from 'net';
import tls from 'tls';
import axios from 'axios';
import * as db from './database.js';
import xuiApi from './xui-api.js';
import bot from './bot.js';
import config from './config.js';
import { spawn, execSync, exec } from 'child_process';
import fs from 'fs';
import dns from 'dns';
import { promisify } from 'util';
import { URL, URLSearchParams } from 'url';

const resolve4 = promisify(dns.resolve4);
const XRAY_PATH = '/usr/local/x-ui/bin/xray-linux-amd64';

// Helper to sanitize and clean VLESS URL parameters for standard client compatibility
function sanitizeVlessUrl(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    const uuid = url.username;
    const host = url.hostname;
    const port = url.port;
    const params = url.searchParams;
    const hash = url.hash;

    const cleanParams = new URLSearchParams();

    const allowedKeys = [
      'encryption',
      'security',
      'sni',
      'pbk',
      'sid',
      'fp',
      'flow',
      'type',
      'path',
      'mode',
      'headerType',
      'serviceName',
      'host',
      'spx'
    ];

    for (const key of allowedKeys) {
      let value = params.get(key);
      if (value !== null && value !== '') {
        if (key === 'type' && value === 'raw') {
          value = 'tcp';
        }
        cleanParams.set(key, value);
      }
    }

    // Filter/clean ALPN to only standard values to prevent handshakes/DPI issues
    const alpn = params.get('alpn');
    if (alpn) {
      const parts = alpn.split(',').map(s => s.trim().toLowerCase());
      const cleanAlpn = parts.filter(s => ['h2', 'http/1.1'].includes(s));
      if (cleanAlpn.length > 0) {
        cleanParams.set('alpn', cleanAlpn.join(','));
      }
    }

    // Ensure encryption=none is always present (required by Hiddify/HAPP sing-box core)
    if (!cleanParams.has('encryption')) {
      cleanParams.set('encryption', 'none');
    }

    // For Reality, ensure fingerprint (fp) is present and defaults to chrome
    if (cleanParams.get('security') === 'reality' && !cleanParams.has('fp')) {
      cleanParams.set('fp', 'chrome');
    }

    const portPart = port ? `:${port}` : '';
    return `vless://${uuid}@${host}${portPart}?${cleanParams.toString()}${hash}`;
  } catch (err) {
    return vlessUrl;
  }
}

// Cache for public reserve nodes: { country: 'DE'|'NL', url: '...' }
export let reserveNodes = [];

// Helper to perform TLS ping to verify VLESS node handshake
function pingTls(host, port, sni, timeout = 2500) {
  return new Promise((resolve) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(false);
        try { socket.destroy(); } catch (e) {}
      }
    }, timeout + 500);

    const socket = tls.connect({
      host: host,
      port: port,
      servername: sni || undefined,
      rejectUnauthorized: false,
      timeout: timeout
    }, () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(true);
        socket.destroy();
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(false);
        socket.destroy();
      }
    });

    socket.on('timeout', () => {
      clearTimeout(timer);
      if (!completed) {
        completed = true;
        resolve(false);
        socket.destroy();
      }
    });
  });
}

// Helper to perform TCP ping to node
function pingTcp(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      status = true;
      socket.end();
    });

    socket.on('data', () => {
      status = true;
      socket.destroy();
    });

    socket.on('error', () => {
      status = false;
      socket.destroy();
    });

    socket.on('timeout', () => {
      status = false;
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });
  });
}

// Helper to convert VLESS URL to xray outbound config
function vlessUrlToOutbound(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    const uuid = url.username;
    const address = url.hostname;
    const port = parseInt(url.port, 10);
    const params = url.searchParams;
    
    const security = params.get('security') || 'none';
    const flow = params.get('flow') || '';
    const sni = params.get('sni') || '';
    const pbk = params.get('pbk') || '';
    const sid = params.get('sid') || '';
    const fp = params.get('fp') || 'chrome';
    const type = params.get('type') || 'tcp';
    
    const outbound = {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": address,
            "port": port,
            "users": [
              {
                "id": uuid,
                "encryption": "none",
                "flow": flow || undefined
              }
            ]
          }
        ]
      },
      "streamSettings": {
        "network": type,
        "security": security
      }
    };
    
    if (security === 'tls') {
      outbound.streamSettings.tlsSettings = {
        "serverName": sni || undefined,
        "fingerprint": fp || undefined
      };
    } else if (security === 'reality') {
      outbound.streamSettings.realitySettings = {
        "show": false,
        "fingerprint": fp || 'chrome',
        "serverName": sni || undefined,
        "publicKey": pbk || undefined,
        "shortId": sid || undefined,
        "spiderX": ""
      };
    }
    
    // Add transport details
    const path = params.get('path');
    const serviceName = params.get('serviceName');
    const mode = params.get('mode');
    
    if (type === 'ws') {
      outbound.streamSettings.wsSettings = {
        "path": path || undefined
      };
    } else if (type === 'grpc') {
      outbound.streamSettings.grpcSettings = {
        "serviceName": serviceName || undefined,
        "multiMode": mode === 'multi'
      };
    }
    
    // Add custom ALPN if present
    const alpn = params.get('alpn');
    if (alpn) {
      const alpnList = alpn.split(',').map(s => s.trim());
      if (security === 'tls') {
        outbound.streamSettings.tlsSettings.alpn = alpnList;
      } else if (security === 'reality') {
        outbound.streamSettings.realitySettings.alpn = alpnList;
      }
    }
    
    return outbound;
  } catch (err) {
    return null;
  }
}

// Verify VLESS proxy by starting a local xray client on the VPS and making a request through it
const execPromise = promisify(exec);

// Helper to execute commands asynchronously with a timeout
async function execAsync(cmd, timeout = 4000) {
  try {
    const { stdout, stderr } = await execPromise(cmd, { timeout });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code || 1, stdout: '', stderr: err.message };
  }
}

// Verify VLESS proxy by starting a local xray client on the VPS and making a request through it
function verifyVlessProxy(vlessUrl, timeout = 3000) {
  return new Promise((resolve) => {
    // If not running on Linux or xray binary doesn't exist, fallback to true since we already did pingTls
    if (process.platform !== 'linux' || !fs.existsSync(XRAY_PATH)) {
      return resolve(true);
    }

    const outbound = vlessUrlToOutbound(vlessUrl);
    if (!outbound) return resolve(false);

    // Random port in range 10800 - 10999 to avoid conflicts
    const testPort = Math.floor(Math.random() * 200) + 10800;
    const configPath = `/tmp/xray-test-${testPort}.json`;

    const xrayConfig = {
      "log": { "loglevel": "warning" },
      "inbounds": [{
        "port": testPort,
        "listen": "127.0.0.1",
        "protocol": "socks",
        "settings": { "udp": true }
      }],
      "outbounds": [outbound, { "protocol": "freedom", "tag": "direct" }]
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(xrayConfig));

      const proc = spawn(XRAY_PATH, ['-c', configPath]);

      proc.on('error', () => {});

      // Wait 1 second for xray to start up
      setTimeout(async () => {
        let success = false;
        try {
          const res1 = await execAsync(`curl -s -x socks5h://127.0.0.1:${testPort} -I https://www.google.com --max-time 3`);
          if (res1.code === 0) {
            success = true;
          } else {
            // Fallback for RU nodes that may block google.com but allow Russian traffic
            const res2 = await execAsync(`curl -s -x socks5h://127.0.0.1:${testPort} -I https://ya.ru --max-time 3`);
            success = res2.code === 0;
          }
        } catch (e) {
          success = false;
        }

        // Kill xray process
        try { proc.kill(); } catch (e) {}

        // Cleanup
        try { fs.unlinkSync(configPath); } catch (e) {}

        resolve(success);
      }, 1000);
    } catch (err) {
      resolve(false);
    }
  });
}

// Cache for GeoIP queries to avoid redundant requests and rate-limiting
const geoCache = new Map();

// Helper to check ISP name and country using fallback APIs
async function getGeoInfo(host) {
  try {
    let ip = host;
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      try {
        const ips = await resolve4(host);
        if (ips && ips.length > 0) {
          ip = ips[0];
        } else {
          return null;
        }
      } catch (dnsErr) {
        return null;
      }
    }
    
    // Check local cache first
    if (geoCache.has(ip)) {
      return geoCache.get(ip);
    }

    // Check database cache next
    try {
      const dbCached = await db.getGeoCache(ip);
      if (dbCached) {
        const result = {
          ip,
          org: dbCached.org || 'UNKNOWN',
          country: dbCached.country || 'UNKNOWN'
        };
        geoCache.set(ip, result);
        return result;
      }
    } catch (dbErr) {
      console.warn('⚠️ SQLite GeoIP cache lookup failed:', dbErr.message);
    }
    
    let result = null;
    
    // Attempt 1: ip-api.com
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 2500 });
      if (res.data && res.data.status === 'success') {
        result = {
          ip,
          org: res.data.org || res.data.isp || 'UNKNOWN',
          country: res.data.countryCode || 'UNKNOWN'
        };
      }
    } catch (e) {
      // ignore and try fallback
    }

    // Attempt 2: freeipapi.com
    if (!result) {
      try {
        const res = await axios.get(`https://freeipapi.com/api/json/${ip}`, { timeout: 2500 });
        if (res.data && res.data.countryCode) {
          result = {
            ip,
            org: res.data.org || res.data.isp || 'UNKNOWN',
            country: res.data.countryCode
          };
        }
      } catch (e) {
        // ignore and try fallback
      }
    }

    // Attempt 3: ipinfo.io
    if (!result) {
      try {
        const res = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 2500 });
        if (res.data && res.data.country) {
          result = {
            ip,
            org: res.data.org || 'UNKNOWN',
            country: res.data.country
          };
        }
      } catch (e) {
        // ignore
      }
    }

    if (!result) {
      result = {
        ip,
        org: 'UNKNOWN',
        country: 'UNKNOWN'
      };
    }

    // Cache the resolved result
    geoCache.set(ip, result);

    // Save to database cache
    try {
      await db.setGeoCache(ip, result.country, result.org);
    } catch (dbErr) {
      console.warn('⚠️ Failed to save GeoIP to SQLite cache:', dbErr.message);
    }

    return result;
  } catch (err) {
    return null;
  }
}

// Check if ISP is blocked/monitored in Russia
function isBlockedIsp(ispName) {
  if (!ispName) return false;
  const lower = ispName.toLowerCase();
  const blockedKeywords = [
    'digitalocean', 'digital ocean', 'hetzner', 'ovh', 'linode', 'akamai',
    'scaleway', 'cloudflare', 'leaseweb', 'm247', 'colocrossing', 'nexus',
    'senko', 'doprax', 'vultr', 'contabo', 'aeza', 'stark', 'pq.hosting',
    'hostkey', 'justhost', 'fly.io', 'heroku', 'datacamp'
  ];
  return blockedKeywords.some(kw => lower.includes(kw));
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Robust validation of VLESS URL parameters
function isValidConfig(url, isBypassList = false) {
  try {
    const queryPart = url.split('?')[1]?.split('#')[0];
    if (!queryPart) return false;

    const params = new URLSearchParams(queryPart);
    
    // Check security type
    const security = params.get('security');
    if (security === 'reality') {
      const pbk = params.get('pbk');
      const sni = params.get('sni');
      const sid = params.get('sid');
      const fp = params.get('fp');
      
      if (!pbk || !sni || !sid) return false;
      if (fp === '') return false; // empty fingerprint
      
      // Block known bad/blocked/unstable SNIs in Russia
      const lowerSni = sni.toLowerCase();
      
      if (isBypassList) {
        // For whitelist bypass, only block offensive keywords (fuck, rkn)
        const trashKeywords = ['fuck', 'rkn'];
        if (trashKeywords.some(keyword => lowerSni.includes(keyword))) {
          return false;
        }
      } else {
        const blockedKeywords = [
          'google.com', 'youtube.com', 'cloudflare.com', 'yahoo.com', 
          'facebook.com', 'instagram.com', 'netflix.com', 'fuck', 'rkn',
          'arvancloud', 'yandex', 'vk.com', 'vk.ru', 'gosuslugi', 'sberbank', 'mail.ru',
          'ok.ru', 'sber.ru', 'tinkoff.ru', 'rambler.ru', 'avito.ru'
        ];
        if (blockedKeywords.some(keyword => lowerSni.includes(keyword))) {
          return false;
        }
      }
    } else if (security === 'tls') {
      const sni = params.get('sni');
      if (!sni) return false;
    } else {
      return false; // must be tls or reality
    }

    // Check for any empty parameters that might cause parsing errors in clients
    for (const [key, value] of params.entries()) {
      if (value === '') {
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

// Helper to verify a single reserve candidate node
async function verifySingleNode(line, forceRuCountry = false) {
  try {
    const cleanLine = sanitizeVlessUrl(line);
    const match = cleanLine.match(/@([^:/]+):(\d+)/);
    if (!match) return null;
    const host = match[1];
    const port = parseInt(match[2], 10);
    
    const sniMatch = cleanLine.match(/[?&]sni=([^&#]+)/);
    const sni = sniMatch ? decodeURIComponent(sniMatch[1]) : '';
    
    // 1. Fast check: TLS port open?
    const isOnline = await pingTls(host, port, sni, 1500);
    if (!isOnline) return null;

    // 2. Fast check: ISP and country check (Done before starting xray!)
    const geo = await getGeoInfo(host);
    const org = geo ? geo.org : 'UNKNOWN';
    const country = geo ? geo.country : 'UNKNOWN';

    if (forceRuCountry && country !== 'RU') {
      console.log(`⏩ Skipped non-RU IP for bypass list: ${host}:${port} | Country: ${country}`);
      return null;
    }

    if (isBlockedIsp(org)) {
      console.log(`⏩ Skipped node on blocked/unknown ISP: ${host}:${port} | ISP: ${org}`);
      return null;
    }

    // 3. Deep check: VLESS proxy working? (Only runs for matching country/ISP!)
    const works = await verifyVlessProxy(cleanLine);
    if (!works) return null;

    return { host, port, org, sni, cleanLine };
  } catch (err) {
    return null;
  }
}

export async function fetchReserveNodes() {
  console.log('⏰ Fetching reserve public nodes from goida-vpn-configs, zieng2/wl, igareck, ByeWhiteLists2, nowmeow, and EtoNeYaProject...');
  try {
    const urls = [
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/1.txt',
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/3.txt',
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/6.txt',
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/9.txt',
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/14.txt',
      'https://fastly.jsdelivr.net/gh/AvenCores/goida-vpn-configs@main/githubmirror/26.txt',
      'https://raw.githubusercontent.com/zieng2/wl/main/vless_universal.txt',
      'https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/Vless-Reality-White-Lists-Rus-Mobile.txt',
      'https://raw.githubusercontent.com/ByeWhiteLists/ByeWhiteLists2/refs/heads/main/ByeWhiteLists2.txt',
      'https://nowmeow.pw/8ybBd3fdCAQ6Ew5H0d66Y1hMbh63GpKUtEXQClIu/whitelist',
      'https://raw.githubusercontent.com/EtoNeYaProject/etoneyaproject.github.io/refs/heads/main/1'
    ];

    const SUPPORTED_COUNTRIES = [
      { code: 'DE', flag: '🇩🇪', name: 'Германия', keywords: ['германия', 'germany'], regex: /\bde\b|\bde-\d+/i },
      { code: 'NL', flag: '🇳🇱', name: 'Нидерланды', keywords: ['нидерланды', 'netherlands'], regex: /\bnl\b|\bnl-\d+/i },
      { code: 'PL', flag: '🇵🇱', name: 'Польша', keywords: ['польша', 'poland'], regex: /\bpl\b|\bpl-\d+/i },
      { code: 'FR', flag: '🇫🇷', name: 'Франция', keywords: ['франция', 'france'], regex: /\bfr\b|\bfr-\d+/i },
      { code: 'RU', flag: '🇷🇺', name: 'Россия', keywords: ['россия', 'russia'], regex: /\bru\b|\bru-\d+/i },
      { code: 'SG', flag: '🇸🇬', name: 'Сингапур', keywords: ['сингапур', 'singapore'], regex: /\bsg\b|\bsg-\d+/i }
    ];

    const candidates = {};
    for (const country of SUPPORTED_COUNTRIES) {
      candidates[country.code] = [];
    }

    for (const url of urls) {
      try {
        console.log(`Downloading configs from: ${url}`);
        const response = await axios.get(url, { timeout: 10000 });
        const text = response.data;
        if (!text || typeof text !== 'string') continue;

        let lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const isBypassList = url.includes('26.txt');
        const isUniversalList = url.includes('vless_universal.txt') || 
                                url.includes('Vless-Reality-White-Lists-Rus-Mobile.txt') ||
                                url.includes('ByeWhiteLists2.txt') ||
                                url.includes('whitelist') ||
                                url.includes('etoneyaproject') ||
                                url.endsWith('/1');
        const isBypassOrUniversal = isBypassList || isUniversalList;

        // Optimize: bypass/universal list is huge, limit it to 400 candidates to prevent long check runs
        if (isBypassOrUniversal) {
          shuffleArray(lines);
          lines = lines.slice(0, 400);
        }

        for (let line of lines) {
          if (!line.startsWith('vless://')) continue;

          // Filter out insecure configs
          if (!xuiApi.isConfigSecure(line)) {
            continue;
          }

          const cleanLine = sanitizeVlessUrl(line);

          // Ensure the config is valid and secure (bypass lists only check offensive SNIs)
          if (!isValidConfig(cleanLine, isBypassOrUniversal)) {
            continue;
          }

          // EXCLUSIVELY use type=grpc (allow tcp/ws/xhttp for bypass/universal lists)
          try {
            const urlObj = new URL(cleanLine);
            const type = urlObj.searchParams.get('type');
            if (type !== 'grpc' && !(isBypassOrUniversal && (type === 'tcp' || type === 'ws' || type === 'xhttp' || !type))) {
              continue;
            }
          } catch (e) {
            continue;
          }

          const parts = cleanLine.split('#');
          if (parts.length < 2) continue;

          const remarkEncoded = parts[1];
          let remark = '';
          try {
            remark = decodeURIComponent(remarkEncoded);
          } catch (e) {
            remark = remarkEncoded;
          }

          const lowerRemark = remark.toLowerCase();

          // Match country
          let matchedCountry = null;
          for (const country of SUPPORTED_COUNTRIES) {
            const hasKeyword = country.keywords.some(kw => lowerRemark.includes(kw));
            const hasRegex = country.regex.test(remark);
            const hasFlag = remark.includes(country.flag);
            if (hasKeyword || hasRegex || hasFlag) {
              matchedCountry = country.code;
              break;
            }
          }

          // If it is from the bypass list, force matchedCountry to 'RU' (Russian whitelist bypass configs)
          if (isBypassList) {
            matchedCountry = 'RU';
          }

          if (matchedCountry) {
            candidates[matchedCountry].push(cleanLine);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Failed to fetch reserve nodes from ${url}: ${err.message}`);
      }
    }

    // Priority SNIs that are highly stable and not blocked by RKN
    const PRIORITY_SNIS = ['microsoft.com', 'apple.com', 'icloud.com', 'cdnjs.com', 'videoproeditor.com', 'speedtest.net', 'samsung.com'];

    function isPriorityNode(url) {
      const sniMatch = url.match(/[?&]sni=([^&#]+)/);
      if (!sniMatch) return false;
      const sni = decodeURIComponent(sniMatch[1]).toLowerCase();
      return PRIORITY_SNIS.some(p => sni === p || sni.endsWith('.' + p));
    }

    function isRobustTransport(url) {
      try {
        const urlObj = new URL(url);
        const type = urlObj.searchParams.get('type');
        return type === 'grpc' || type === 'ws' || type === 'xhttp';
      } catch (e) {
        return false;
      }
    }

    // Deduplicate queues by host:port
    function uniqNodes(lines) {
      const seen = new Set();
      return lines.filter(line => {
        const match = line.match(/@([^:/]+):(\d+)/);
        if (!match) return false;
        const key = `${match[1]}:${match[2]}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const uniqueQueues = {};
    for (const country of SUPPORTED_COUNTRIES) {
      const list = candidates[country.code];
      let priority, regular;

      if (country.code === 'RU') {
        // Prioritize WS/gRPC/XHTTP transport types for Russia to bypass XTLS-Reality DPI blocks
        priority = list.filter(c => isRobustTransport(c) || isPriorityNode(c));
        regular = list.filter(c => !isRobustTransport(c) && !isPriorityNode(c));
      } else {
        priority = list.filter(c => isPriorityNode(c));
        regular = list.filter(c => !isPriorityNode(c));
      }

      shuffleArray(priority);
      shuffleArray(regular);
      uniqueQueues[country.code] = uniqNodes([...priority, ...regular]);
    }

    const verifiedNodes = [];

    async function processQueueInChunks(queue, limit, targetArray, countryCode) {
      const maxNodes = countryCode === 'RU' ? 10 : 3;
      let index = 0;
      while (targetArray.length < maxNodes && index < queue.length) {
        const chunk = queue.slice(index, index + limit);
        index += limit;

        const promises = chunk.map(line => verifySingleNode(line, countryCode === 'RU'));
        const results = await Promise.all(promises);

        for (const res of results) {
          if (res) {
            if (targetArray.length >= maxNodes) break;
            console.log(`🟢 Added ${countryCode} reserve node: ${res.host}:${res.port} | ISP: ${res.org} | SNI: ${res.sni}`);
            targetArray.push({ country: countryCode, url: res.cleanLine });
          }
        }
      }
    }

    // Verify candidates to find up to 3 working ones per country
    for (const country of SUPPORTED_COUNTRIES) {
      const queue = uniqueQueues[country.code];
      const countryNodes = [];
      if (queue.length > 0) {
        console.log(`⏳ Verifying ${country.code} candidate queue (${queue.length} nodes) in chunks of 5...`);
        await processQueueInChunks(queue, 5, countryNodes, country.code);
      }
      verifiedNodes.push(...countryNodes);
    }

    reserveNodes = verifiedNodes;
    
    // Log counts
    const countsLog = SUPPORTED_COUNTRIES.map(c => {
      const count = reserveNodes.filter(n => n.country === c.code).length;
      return `${c.code}: ${count}`;
    }).join(', ');
    
    console.log(`✅ Cached ${reserveNodes.length} verified reserve nodes (${countsLog})`);
  } catch (error) {
    console.error('❌ Failed to fetch reserve nodes:', error.message);
  }
}

// Function to check and disable expired subscriptions
export async function checkExpiredSubscriptions() {
  console.log('⏰ Running subscription expiry check...');
  try {
    const expiredList = await db.getExpiredSubscriptions();
    console.log(`🔍 Found ${expiredList.length} expired active subscriptions.`);

    for (const sub of expiredList) {
      console.log(`⏳ Processing expiry for user ${sub.tg_id} (email: ${sub.client_email})...`);
      
      // 1. Delete/Disable client in 3x-ui panel
      const deleted = await xuiApi.deleteClient(sub.client_email, sub.client_uuid);
      
      if (!deleted && !xuiApi.mockMode) {
        console.error(`❌ Failed to delete client ${sub.client_email} in 3x-ui. Skipping DB update to retry later.`);
        continue; // Don't mark as expired in DB if API call failed, so we can retry on next cron run
      }

      // 2. Mark as expired in SQLite
      await db.deactivateSubscription(sub.id);
      console.log(`✅ Subscription ${sub.id} marked as expired in DB.`);

      // 3. Notify user in Telegram
      try {
        await bot.telegram.sendMessage(
          sub.tg_id,
          `⚠️ <b>Время действия вашей подписки Knight VPN истекло!</b>\n\nДоступ к VPN временно приостановлен. Вы можете легко восстановить его в любой момент!\nПри продлении доступа ваш ключ доступа останется прежним.\n\n💳 Перейдите в профиль или нажмите на кнопку ниже, чтобы продлить доступ:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Продлить доступ', callback_data: 'buy_menu' }],
                [{ text: '👤 Перейти в профиль', callback_data: 'profile_menu' }]
              ]
            }
          }
        );
        console.log(`✉️ Expiry notification sent to user ${sub.tg_id}.`);
      } catch (err) {
        console.warn(`⚠️ Could not send expiry notification to user ${sub.tg_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error during subscription expiry check:', error);
  }
}

// Function to send warnings 24 hours before expiration
export async function sendWarningNotifications() {
  console.log('⏰ Running subscription warning check...');
  try {
    const warningList = await db.getExpiringSubscriptions();
    console.log(`🔍 Found ${warningList.length} active subscriptions expiring in 24 hours.`);

    for (const sub of warningList) {
      console.log(`⏳ Sending warning notification to user ${sub.tg_id}...`);

      // 1. Notify user in Telegram
      try {
        await bot.telegram.sendMessage(
          sub.tg_id,
          `⚠️ <b>Внимание! Ваша подписка Knight VPN истекает через 24 часа!</b>\n\nЗавтра доступ к VPN будет автоматически приостановлен. Чтобы пользоваться VPN без перебоев, вы можете продлить подписку прямо сейчас. При продлении ваш ключ доступа останется прежним!\n\n💳 Нажмите на кнопку ниже, чтобы продлить доступ:`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Продлить доступ', callback_data: 'buy_menu' }],
                [{ text: '👤 Перейти в профиль', callback_data: 'profile_menu' }]
              ]
            }
          }
        );
        console.log(`✉️ Warning notification sent to user ${sub.tg_id}.`);
        
        // 2. Mark warning_sent in DB
        await db.markWarningSent(sub.id);
      } catch (err) {
        console.warn(`⚠️ Could not send warning notification to user ${sub.tg_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error during warning check:', error);
  }
}

// Function to ping nodes and notify admins if status changes
export async function checkNodesHealth() {
  console.log('⏰ Running nodes health check...');
  try {
    const nodes = await xuiApi.getNodes();
    if (!nodes || nodes.length === 0) {
      console.log('No nodes found to ping.');
      return;
    }

    // Get the port of inbound 1
    const inbound = await xuiApi.getInbound(config.XUI_INBOUND_ID);
    const defaultPort = inbound ? inbound.port : 443;

    for (const node of nodes) {
      if (!node.address) continue;

      // Determine correct port to check (use 443 for known slaves/addresses where default port is not accessible)
      let port = defaultPort;
      const isSlave = node.address === '194.50.94.46' || node.address === process.env.NL_SSH_HOST ||
                      node.address === '31.76.46.20' || node.address === process.env.FI_SSH_HOST ||
                      node.address === '188.255.163.236' || node.address === process.env.PL_SSH_HOST;
      if (isSlave) {
        port = 443;
      }

      const isOnline = await pingTcp(node.address, port);
      const wasOffline = xuiApi.isNodeOffline(node.address);
      const name = node.remark || `Узел ${node.id}`;

      if (!isOnline && !wasOffline) {
        // Node went offline
        xuiApi.markNodeOffline(node.address);
        console.error(`⚠️ Node ${name} (${node.address}) went OFFLINE!`);
        await notifyAdmins(`⚠️ <b>Внимание! Узел "${name}" (${node.address}) недоступен!</b>\nОн временно исключен из выдачи подписок.`);
      } else if (isOnline && wasOffline) {
        // Node recovered
        xuiApi.markNodeOnline(node.address);
        console.log(`🟢 Node ${name} (${node.address}) is back ONLINE!`);
        await notifyAdmins(`🟢 <b>Отличные новости! Узел "${name}" (${node.address}) снова в сети!</b>\nОн возвращен в выдачу подписок.`);
      } else {
        console.log(`Node ${name} (${node.address}) status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      }
    }
  } catch (error) {
    console.error('❌ Error during nodes health check:', error);
  }
}

// Helper to alert admins
async function notifyAdmins(message) {
  const adminIds = config.ADMIN_TG_IDS || [];
  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.warn(`Failed to notify admin ${adminId}:`, err.message);
    }
  }
}

// Setup scheduler
export function initScheduler() {
  // Expiry, warning and reserve node scraping - hourly
  cron.schedule('0 * * * *', async () => {
    await checkExpiredSubscriptions();
    await sendWarningNotifications();
    await fetchReserveNodes();
  });

  // Health check - every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await checkNodesHealth();
  });
  
  console.log('📅 Scheduler initialized (hourly checks, 15-min node health checks).');
  
  // Run checks once immediately on startup
  checkExpiredSubscriptions().catch(err => console.error('Initial expiry check failed:', err));
  sendWarningNotifications().catch(err => console.error('Initial warning check failed:', err));
  fetchReserveNodes().catch(err => console.error('Initial fetch reserve nodes failed:', err));
  checkNodesHealth().catch(err => console.error('Initial health check failed:', err));
}
