# XHTTP-REWORK HANDOFF — переработка сервера обхода белых списков

> **Документ для агента-преемника.** Содержит: что сделано, что осталось, точный формат ссылки, готовые команды.
> **Статус:** ✅ Сервер готов. 🔧 Остаётся ТОЛЬКО правка кода бота (Этап 3), чтобы клиенты получали рабочую XHTTP-ссылку.

---

## 🎯 TL;DR

**Серверная инфраструктура полностью готова и работает end-to-end:**
```
Телефон → Yandex CDN (cdn.node-ping-stat.ru) → nginx :80 → Xray XHTTP :8080  ✅
```

**Единственное, что осталось — Этап 3: правка кода бота.** Сейчас бот всё ещё выдаёт клиентам **старые WS-ссылки**, а Xray на сервере уже ждёт **XHTTP**. Из-за этого несоответствия клиент не сможет подключиться, просто обновив подписку. Нужно научить бот генерировать VLESS-XHTTP-ссылку.

**После Этапа 3:** клиент просто обновляет подписку в приложении → получает новую XHTTP-ссылку → подключается → **работает**.

---

## ✅ ЧТО УЖЕ СДЕЛАНО И ПРОВЕРЕНО (read-only ревизия)

### Серверная часть (Этапы 1 + 2) — ГОТОВО

| Компонент | Состояние | Проверка |
|-----------|-----------|----------|
| **Инбаунд 4 в 3x-ui** | `network=xhttp`, `mode=packet-up`, `path=/knight-down`, `host=cdn.node-ping-stat.ru` | `diag-inbounds.js` ✅ |
| **Конфиг Xray** (`config.json`) | Реально слушает 8080 как `xhttp` с path `/knight-down` | python-парсинг ✅ |
| **x-ui перезапущен** | `2026-06-18 22:33:22 UTC` | `systemctl show` ✅ |
| **nginx config** | `nginx-xhttp.conf` залит, `nginx -t` = OK, `active` | `nginx -t` ✅ |
| **CDN → nginx → Xray** | `cdn-root` → 200, `cdn-down` → 404 (XHTTP отсекает «голый» GET, это норма) | curl через CDN ✅ |
| **Бэкапы** | nginx + БД на VPS, инбаунд 4 в JSON локально | `ls` ✅ |
| **bridge-adapter** | `inactive/not-found` (уже остановлен) | `systemctl` ✅ |

### Клиенты в инбаунде 4 (XHTTP, `_cdn`):
- `vpn_user_797540993_cdn` (uuid `985e730a-42aa-441f-88a0-d9223e6da8b1`, limit 2, 15GB)
- `vpn_user_1408185683_cdn` (uuid `252be4ca-a78b-6732-94f1-b3f9a6f964cc`, limit 1, 15GB)
- `vpn_user_7201326641_cdn` (uuid `d58dabf1-...`, 15GB)

> **Важно:** UUID клиентов в инбаунде 4 = `getBypassUuid(mainUuid)` = SHA-256 от основного UUID. Бот должен использовать тот же алгоритм.

### Созданные scratch-скрипты:
- `create-xhttp-inbound.js` (v2 — берёт клиентов из бэкапа)
- `nginx-xhttp.conf` (залит на VPS)
- `diag-inbounds.js`, `diag-xhttp-capabilities.js`, `dump-inbound.js`
- `run-remote-cmd.js` (SSH-обёртка, добавлен `readyTimeout: 60000`)
- `inbound-4-backup.json` (точка отката)

---

## 🔧 ЭТАП 3 — ЕДИНСТВЕННОЕ, ЧТО ОСТАЛОСЬ (правка кода бота)

### Цель
Клиент обновляет подписку в приложении → получает VLESS-XHTTP-ссылку → подключается → работает.

### Формат VLESS-XHTTP-ссылки (Xray 26.6.1, цель Этапа 3)

```
vless://<bypassUuid>@cdn.node-ping-stat.ru:443
  ?type=xhttp
  &security=tls
  &sni=cdn.node-ping-stat.ru
  &host=cdn.node-ping-stat.ru
  &path=%2Fknight-down
  &mode=packet-up
  #🇷🇺 LTE | Обходка
```

**Параметры:**
- `<bypassUuid>` = `getBypassUuid(mainUuid)` (SHA-256 хеш, функция уже есть в `src/xui-api.js:5-8`)
- host = `cdn.node-ping-stat.ru`, порт 443 (CDN терминирует TLS)
- `type=xhttp` (НЕ `ws`, НЕ `splithttp`!)
- `security=tls` (CDN терминирует TLS, клиент видит TLS)
- `path=/knight-down` (URL-encoded как `%2Fknight-down`)
- `mode=packet-up` (максимальная совместимость с CDN)

> **Заметка про `extra` поле:** в полном формате Xray v26 есть `extra=<URL-encoded JSON>` с `scMaxEachPostBytes`, `xPaddingBytes` и т.д. **НО** эти параметры уже заданы **на серверной стороне** (в `xhttpSettings.extra` инбаунда 4). Клиенту их передавать необязательно — сервер применит свои. Рекомендую **НЕ класть extra в ссылку**, чтобы максимизировать совместимость с Happ/Hiddify (они плохо парсят `extra` в GUI). Сервер сам навяжет нужные параметры.

### 📝 ПОШАГОВЫЙ ПЛАН ЭТАПА 3

#### Шаг 3.1 — `src/config.js` (добавить/обновить ключи)

Добавить чтение из `.env`:
```js
const xhttpPath = process.env.XHTTP_PATH || '/knight-down';
const xhttpMode = process.env.XHTTP_MODE || 'packet-up';
```
И в `export default`:
```js
XHTTP_PATH: xhttpPath,
XHTTP_MODE: xhttpMode,
```

**Убрать/обесценить** (оставить как есть, но не использовать): `USE_CDN_BYPASS`, `BYPASS_HOST`, `BYPASS_PORT`, старое `CDN_PATH`.

#### Шаг 3.2 — `src/xui-api.js` — добавить `buildXhttpLink()`

Новый метод (в классе `XuiClient`, рядом с `buildRealityLink`):
```js
// Построить VLESS-XHTTP ссылку для обхода через CDN
buildXhttpLink(bypassUuid) {
  const host = config.CDN_DOMAIN || 'cdn.node-ping-stat.ru';
  const path = encodeURIComponent(config.XHTTP_PATH || '/knight-down');
  const mode = config.XHTTP_MODE || 'packet-up';
  const remark = '🇷🇺 LTE | Обходка';
  return `vless://${bypassUuid}@${host}:443?type=xhttp&security=tls&sni=${host}&host=${host}&path=${path}&mode=${mode}#${encodeURIComponent(remark)}`;
}
```

В `addClient()`, в блоке CDN inbound (строки 255-284) — после регистрации клиента возвращать эту ссылку как `bypassConnectionUrl`:
```js
// Вместо текущего игнорирования — строим XHTTP-ссылку
if (config.XUI_CDN_INBOUND_ID) {
  // ... регистрация клиента в инбаунде 4 (как сейчас) ...
  bypassConnectionUrl = this.buildXhttpLink(bypassUuid);
}
```

#### Шаг 3.3 — `src/sub-server.js:101-176` — переписать генерацию bypass

Заменить **обе** ветки (`USE_CDN_BYPASS=true` и `=false`) одним простым блоком.
**Рекомендуемый вариант (надёжнее)** — строить ссылку на лету, не полагаясь на БД:
```js
// Генерируем VLESS-XHTTP ссылку для обхода через CDN (на лету из UUID)
if (sub.bypass_connection_url) {
  const uuidMatch = sub.bypass_connection_url.match(/vless:\/\/([^@]+)@/);
  const bypassUuid = uuidMatch ? uuidMatch[1] : sub.client_uuid;
  const host = config.CDN_DOMAIN || 'cdn.node-ping-stat.ru';
  const path = encodeURIComponent(config.XHTTP_PATH || '/knight-down');
  const mode = config.XHTTP_MODE || 'packet-up';
  const xhttpLink = `vless://${bypassUuid}@${host}:443?type=xhttp&security=tls&sni=${host}&host=${host}&path=${path}&mode=${mode}#${encodeURIComponent('🇷🇺 LTE | Обходка')}`;
  configsText += xhttpLink + '\n';
}
```
(Этот вариант не требует миграции БД — берёт UUID из старой ссылки и пересобирает в XHTTP-формат.)

#### Шаг 3.4 — Обновить `.env` на VPS

`/root/knight-vpn-bot/.env`:
```env
CDN_DOMAIN=cdn.node-ping-stat.ru
XHTTP_PATH=/knight-down
XHTTP_MODE=packet-up
# (USE_CDN_BYPASS, BYPASS_HOST, BYPASS_PORT, CDN_PATH — можно оставить как есть, не используются)
```

#### Шаг 3.5 — Залить код на VPS + перезапустить бота

```bash
# Локально — залить src/ и .env на VPS через deploy.js
node scratch/deploy.js
# ИЛИ вручную: sftp загрузить src/ и .env

# На VPS — перезапустить бота
node scratch/run-remote-cmd.js "pm2 restart knight-vpn-bot"
```

#### Шаг 3.6 — Проверить генерацию ссылки

```bash
# Узнать UUID подписки для теста:
node scratch/run-remote-cmd.js "sqlite3 /root/knight-vpn-bot/database.db 'SELECT client_uuid FROM subscriptions WHERE status=\"active\" LIMIT 1;'"

# Подписка должна теперь отдавать XHTTP-ссылку
node scratch/run-remote-cmd.js "curl -s http://127.0.0.1:3000/sub/<UUID> | base64 -d 2>/dev/null | grep xhttp"
# Должна появиться строка с type=xhttp
```

#### Шаг 3.7 — Миграция существующих подписок (опционально)

Если выбрана стратегия «строить на лету» (Шаг 3.3) — миграция **не нужна**, ссылка пересобирается из UUID при каждом запросе `/sub/`.

---

## 🧪 ФИНАЛЬНАЯ ПРОВЕРКА (после Этапа 3)

1. **Бот отдаёт XHTTP-ссылку:** `curl ... | grep xhttp` → есть `type=xhttp&...mode=packet-up`
2. **Реальный клиент:** импортировать подписку в Happ/Hiddify → обновить → должна появиться конфигурация `🇷🇺 LTE | Обходка` (XHTTP) → подключиться → проверить что IP изменился и трафик идёт
3. **Если не подключается** — проверить логи Xray:
   ```bash
   node scratch/run-remote-cmd.js "journalctl -u x-ui -n 50 --no-pager | grep -i '8080\|xhttp\|knight-down'"
   ```

---

## ⚠️ КРИТИЧНЫЕ НЮАНСЫ (читать обязательно)

1. **`get-only` ≠ `uploadMethod=GET`!** В Xray 26.6.1 полей `uploadMethod`/`downloadMethod` **НЕТ** (они были в эре SplitHTTP). Используем `mode=packet-up` — это и есть «get-only» (download-via-GET + upload-via-маленькие-POST). Не генерировать `type=splithttp&uploadMethod=GET`!

2. **Формат ссылки — `type=xhttp`**, НЕ `ws`, НЕ `splithttp`. Xray 26.6.1 использует именно `xhttp`.

3. **Локальная БД ≠ боевая БД.** Локальная `database.db` пустая/отличается от `/root/knight-vpn-bot/database.db`. Скрипты для панели берут клиентов из `scratch/inbound-4-backup.json`, а не из локальной БД.

4. **`/etc/nginx/sites-enabled/default` — симлинк** на `sites-available/default`.

5. **15 ГБ лимит** на bypass-профиль сохранён в инбаунде 4 (`totalGB=16106127360`).

6. **`forceExtendUser()` (database.js:318-332)** создаёт dummy-подписки с `bypassConnectionUrl=null` — при стратегии «на лету» это не проблема (ссылка строится из UUID).

7. **Happ/Hiddify совместимость:** НЕ класть `extra` JSON в ссылку — сервер уже навязывает параметры. Только базовые поля: `type`, `security`, `sni`, `host`, `path`, `mode`.

8. **API панели 3x-ui возвращает устаревший объект сразу после `update`** — реальное состояние проверять через `diag-inbounds.js` (полный `list`), а не `get`.

---

## 📂 КЛЮЧЕВЫЕ ФАЙЛЫ

| Файл | Назначение |
|------|-----------|
| `src/xui-api.js` | 🔧 **ПРАВИТЬ** — добавить `buildXhttpLink()`, обновить `addClient()` |
| `src/sub-server.js` | 🔧 **ПРАВИТЬ** — блок 101-176, генерация bypass-ссылки |
| `src/config.js` | 🔧 **ПРАВИТЬ** — добавить `XHTTP_PATH`, `XHTTP_MODE` |
| `/root/knight-vpn-bot/.env` (VPS) | 🔧 **ПРАВИТЬ** — обновить значения |
| `src/database.js` | ✅ Не трогать (колонка `bypass_connection_url` остаётся) |
| `scratch/create-xhttp-inbound.js` | ✅ Готов (инбаунд уже создан) |
| `scratch/nginx-xhttp.conf` | ✅ Готов (залит на VPS) |
| `scratch/diag-inbounds.js` | ✅ Read-only проверка инбаундов |
| `scratch/run-remote-cmd.js` | ✅ SSH-обёртка (готов таймаут 60s) |
| `scratch/inbound-4-backup.json` | ✅ Точка отката инбаунда 4 |

---

## 🛡️ КАК ОТКАТИТЬСЯ

**Откат инбаунда 4 (к WS):** пересоздать из `scratch/inbound-4-backup.json` через API `POST /panel/api/inbounds/update/4` (по образцу `create-xhttp-inbound.js`, но payload из бэкапа).

**Откат nginx:**
```bash
node scratch/run-remote-cmd.js "cp /etc/nginx/sites-available/default.bak-xhttp /etc/nginx/sites-available/default && nginx -t && systemctl reload nginx"
```

**Откат БД:**
```bash
node scratch/run-remote-cmd.js "cp /root/knight-vpn-bot/database.db.bak-xhttp /root/knight-vpn-bot/database.db && pm2 restart knight-vpn-bot"
```

**Откат кода бота (после Этапа 3):** `git checkout src/ && pm2 restart knight-vpn-bot` (на VPS через deploy.js).

---

## 📖 КОНТЕКСТ И ИСТОЧНИКИ

### Расшифровка наводок пользователя (`CDN xhttp get-only`)
- **CDN** — трафик через Yandex Cloud CDN (`cdn.node-ping-stat.ru` → `188.72.103.3`, белые списки ТСПУ)
- **xhttp** — транспорт XHTTP в Xray-core, прокси поверх обычного HTTP(S)
- **get-only** — режим packet-up: download-via-GET + upload-via-маленькие-POST = максимальная совместимость с CDN

### Решения пользователя
1. CDN: Yandex Cloud, домен `cdn.node-ping-stat.ru`
2. Xray: текущий зарубежный `141.11.197.6`
3. Инбаунд через 3x-ui панель
4. Старый обход **ПОЛНОСТЬЮ ЗАМЕНИТЬ**
5. В клиенте 2 профиля: основной + обход

### Архитектура (было → стало)
**Было (нерабочее):** Телефон → WSS → Yandex API Gateway → Cloud Function → Go-адаптер (:7319) → Xray WS :8080
**Стало:** Телефон → HTTPS → Yandex CDN → nginx :80 → Xray XHTTP :8080

### Источники
- [#4113 «XHTTP: Beyond REALITY»](https://github.com/XTLS/Xray-core/discussions/4113)
- [#4118 «xhttp 5-в-1»](https://github.com/XTLS/Xray-core/discussions/4118)
- [Habr 990206](https://habr.com/en/articles/990206/) — обход белых списков (РФ)
- [xtls.github.io transport docs](https://xtls.github.io/en/config/transport.html)

### Параметры xhttpSettings (применены в инбаунде 4, серверная сторона):
| параметр | значение |
|----------|----------|
| `mode` | `packet-up` |
| `path` | `/knight-down` |
| `host` | `cdn.node-ping-stat.ru` |
| `extra.xPaddingBytes` | `100-1000` |
| `extra.scMaxEachPostBytes` | `100000-1000000` |
| `extra.scMinPostsIntervalMs` | `10-30` |
| `extra.scMaxBufferedPosts` | `30` |
| `extra.noGRPCHeader` | `false` |
