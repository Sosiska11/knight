import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';
import fs from 'fs';

const resolve4 = promisify(dns.resolve4);

async function getIspInfo(ip) {
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
    if (res.data && res.data.status === 'success') {
      return {
        isp: res.data.isp,
        org: res.data.org,
        as: res.data.as,
        country: res.data.country,
        city: res.data.city
      };
    }
  } catch (err) {
    // Ignore error
  }
  return { isp: 'Unknown', org: 'Unknown', as: 'Unknown', country: 'Unknown', city: 'Unknown' };
}

async function run() {
  const url = 'https://sub.adrenalin.lol/rvLzwA_AQPF8VR63';
  try {
    console.log('Fetching JSON config from Adrenaline VPN...');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Happ/1.0',
        'x-hwid': 'bcd9c6bf-7812-4ea2-967f-4daf33dcc015'
      },
      timeout: 10000
    });

    const configs = response.data;
    if (!Array.isArray(configs)) {
      console.error('Response is not an array of configurations.');
      return;
    }

    console.log(`Found ${configs.length} configurations.\n`);

    const servers = [];
    const seenServers = new Set();

    for (const conf of configs) {
      const remark = conf.remarks || 'Unnamed';
      const outbounds = conf.outbounds || [];
      for (const out of outbounds) {
        if (out.protocol === 'vless' || out.protocol === 'shadowsocks' || out.protocol === 'trojan' || out.protocol === 'vmess') {
          const vnext = out.settings?.vnext || [];
          const serversList = out.settings?.servers || [];
          
          // For vless/vmess
          for (const vn of vnext) {
            const address = vn.address;
            if (address && !seenServers.has(address)) {
              seenServers.add(address);
              servers.push({ host: address, remark });
            }
          }
          // For shadowsocks/trojan
          for (const s of serversList) {
            const address = s.address;
            if (address && !seenServers.has(address)) {
              seenServers.add(address);
              servers.push({ host: address, remark });
            }
          }
        }
      }
    }

    console.log(`Extracted ${servers.length} unique server domains:\n`);

    const results = [];
    for (const s of servers) {
      console.log(`Analyzing ${s.host} (${s.remark})...`);
      let ip = 'Unknown';
      let ispInfo = { isp: 'Unknown', org: 'Unknown', as: 'Unknown', country: 'Unknown', city: 'Unknown' };

      try {
        const ips = await resolve4(s.host);
        if (ips && ips.length > 0) {
          ip = ips[0];
          ispInfo = await getIspInfo(ip);
        }
      } catch (err) {
        console.error(`  - Failed to resolve: ${err.message}`);
      }

      results.push({
        remark: s.remark,
        host: s.host,
        ip,
        ...ispInfo
      });
    }

    console.log('\n==================================================================');
    console.log('                 ADRENALIN VPN HOSTING PROVIDERS');
    console.log('==================================================================\n');

    results.forEach((r, idx) => {
      console.log(`${idx + 1}. Node: ${r.remark}`);
      console.log(`   Domain: ${r.host}`);
      console.log(`   IP: ${r.ip}`);
      console.log(`   Country/City: ${r.country} / ${r.city}`);
      console.log(`   ISP (Provider): ${r.isp}`);
      console.log(`   Org (Organization): ${r.org}`);
      console.log(`   AS: ${r.as}`);
      console.log('------------------------------------------------------------------');
    });

    fs.writeFileSync('scratch/adrenalin_hosts_report.json', JSON.stringify(results, null, 2));
    console.log('\nReport saved to scratch/adrenalin_hosts_report.json');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

run();
