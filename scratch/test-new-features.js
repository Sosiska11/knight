import xuiApi from '../src/xui-api.js';
import { fetchReserveNodes, reserveNodes, checkNodesHealth } from '../src/cron.js';

async function testAll() {
  console.log('🧪 === НАЧИНАЕМ ТЕСТИРОВАНИЕ НОВЫХ ФУНКЦИЙ ===\n');

  // 1. Тест проверки безопасности (allowInsecure)
  console.log('--- 1. Тест проверки безопасности (isConfigSecure) ---');
  const secureLink = 'vless://uuid@host:443?security=reality&pbk=123#Node';
  const insecureLink1 = 'vless://uuid@host:443?security=reality&allowInsecure=true#Node';
  const insecureLink2 = 'vless://uuid@host:443?security=reality&allow_insecure=1#Node';
  const insecureLink3 = 'vless://uuid@host:443?security=reality&insecure=yes#Node';

  console.log('Secure link (expect true):', xuiApi.isConfigSecure(secureLink));
  console.log('Insecure link 1 (expect false):', xuiApi.isConfigSecure(insecureLink1));
  console.log('Insecure link 2 (expect false):', xuiApi.isConfigSecure(insecureLink2));
  console.log('Insecure link 3 (expect false):', xuiApi.isConfigSecure(insecureLink3));
  console.log('-----------------------------------------------------\n');

  // 2. Тест оффлайн-кэша нод
  console.log('--- 2. Тест оффлайн-кэша нод ---');
  const testIp = '1.2.3.4';
  console.log('Is testIp offline initially? (expect false):', xuiApi.isNodeOffline(testIp));
  xuiApi.markNodeOffline(testIp);
  console.log('Is testIp offline after markNodeOffline? (expect true):', xuiApi.isNodeOffline(testIp));
  xuiApi.markNodeOnline(testIp);
  console.log('Is testIp offline after markNodeOnline? (expect false):', xuiApi.isNodeOffline(testIp));
  console.log('-----------------------------------------------------\n');

  // 3. Тест загрузки резервных нод из goida-vpn-configs
  console.log('--- 3. Тест загрузки резервных нод (AvenCores) ---');
  await fetchReserveNodes();
  console.log(`Получено резервных нод: ${reserveNodes.length}`);
  reserveNodes.forEach((node, idx) => {
    console.log(`[${idx + 1}] Страна: ${node.country}, Ссылка: ${node.url.substring(0, 100)}...`);
  });
  console.log('-----------------------------------------------------\n');

  // 4. Тест генерации обходок с разными SNI (имитируем sub-server.js логику)
  console.log('--- 4. Тест генерации динамических обходок ---');
  const dummyBypassUrl = 'vless://test-uuid@bypass-server.net:443?type=tcp&security=reality&pbk=key&fp=chrome&sni=original.com#Bypass';
  
  const sniBypasses = [
    { name: 'Госуслуги', sni: 'gosuslugi.ru' },
    { name: 'Сбербанк', sni: 'sberbank.ru' },
    { name: 'Яндекс', sni: 'yandex.ru' },
    { name: 'ВКонтакте', sni: 'vk.com' }
  ];

  console.log('Исходная обходка:', dummyBypassUrl);
  sniBypasses.forEach(bp => {
    let bypassUrl = dummyBypassUrl;
    if (bypassUrl.includes('sni=')) {
      bypassUrl = bypassUrl.replace(/sni=[^&]+/g, `sni=${bp.sni}`);
    }
    const newRemark = `🇷🇺 LTE | Обходка (${bp.name})`;
    bypassUrl = bypassUrl.split('#')[0] + '#' + newRemark;
    console.log(`Сгенерирована: ${bypassUrl}`);
  });
  console.log('-----------------------------------------------------\n');

  // 5. Тест пинга и диагностики нод (Health Check)
  console.log('--- 5. Тест диагностики нод (Health Check) ---');
  // Мы переключим XuiClient в mockMode на время теста, чтобы не делать реальных запросов к панели,
  // но функция getNodes вернет пустой массив или мы можем подменить логику в тестах.
  // Давайте просто запустим диагностику:
  await checkNodesHealth();
  console.log('-----------------------------------------------------\n');

  console.log('🎉 === ТЕСТИРОВАНИЕ ЗАВЕРШЕНО ===');
}

testAll();
