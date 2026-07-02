# Настройка обхода блокировок через Yandex Cloud (yac-ws-bridge)

Обход через **Yandex Cloud Serverless Functions + API Gateway**. Трафик идёт через IP-адреса Яндекса (белый список операторов), а Cloud Function пересылает данные на ваш зарубежный VPS.

---

## Шаг 1. Service Account (Сервисный аккаунт)

1. Зайдите в [консоль управления Yandex Cloud](https://console.yandex.cloud/)
2. Перейдите в **IAM → Service Accounts**
3. Нажмите **Создать сервисный аккаунт**
4. Имя: `cdn-assets-sa`
5. **Роли** — добавьте:
   - `serverless.functions.invoker`
   - `api-gateway.websocketBroadcaster`
6. Нажмите **Создать**
7. Запишите **ID сервисного аккаунта** (понадобится для spec.yaml)

---

## Шаг 2. Cloud Function (Облачная функция)

1. Перейдите в **Cloud Functions → Функции**
2. Нажмите **Создать функцию**
3. Имя: `cdn-asset-delivery`
4. Нажмите **Создать**
5. На странице функции нажмите **Создать версию**:
   - **Среда выполнения**: `Node.js 18`
   - **Способ**: Загрузить ZIP-архив
   - Загрузите файл `bridge-cloud.zip` (из папки `scratch/`)
   - **Точка входа**: `index.handler`
   - **Таймаут**: `30` секунд
   - **Память**: `128 МБ`
   - **Сервисный аккаунт**: выберите `cdn-assets-sa`
6. **Переменные окружения**:
   ```
   AUTH_TOKEN = c19eaca4175499538927f6c03e4f5880
   HTTP_URL = http://141.11.197.6:7319/health/78bf073d
   ```
7. Нажмите **Создать версию**
8. Запишите **ID функции** (понадобится для spec.yaml)

---

## Шаг 3. API Gateway

1. Перейдите в **API Gateway**
2. Откройте ваш существующий шлюз (`d5dppna7jrcjlkqf35tp.y3q8o1jq.apigw.yandexcloud.net`) или создайте новый
3. Нажмите **Редактировать**
4. Замените спецификацию на:

```yaml
openapi: 3.0.0
info:
  title: Static Web Assets CDN Gateway
  version: 1.0.0

paths:
  /api/v1/012c7dca:
    x-yc-apigateway-websocket-connect:
      operationId: upstream-connect
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: upstream
    x-yc-apigateway-websocket-message:
      operationId: upstream-message
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: upstream
    x-yc-apigateway-websocket-disconnect:
      operationId: upstream-disconnect
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: upstream

  /{path+}:
    x-yc-apigateway-websocket-connect:
      operationId: client-connect
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: client
    x-yc-apigateway-websocket-message:
      operationId: client-message
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: client
    x-yc-apigateway-websocket-disconnect:
      operationId: client-disconnect
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: <ВСТАВЬТЕ_ID_ФУНКЦИИ>
        tag: "$latest"
        service_account_id: <ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>
        context:
          route: client
```

5. Замените все `<ВСТАВЬТЕ_ID_ФУНКЦИИ>` на ID вашей Cloud Function
6. Замените все `<ВСТАВЬТЕ_ID_СЕРВИСНОГО_АККАУНТА>` на ID вашего Service Account
7. Нажмите **Сохранить**

---

## Шаг 4. Деплой адаптера на VPS

После настройки Yandex Cloud, запустите скрипт деплоя:
```bash
node scratch/deploy-bridge-adapter.js
```

Этот скрипт автоматически:
- Установит Go на VPS
- Склонирует и соберёт адаптер
- Создаст systemd-сервис `bridge-adapter`
- Откроет порт 7319

---

## Шаг 5. Проверка

1. На VPS проверьте логи адаптера:
   ```bash
   journalctl -u bridge-adapter -f
   ```
   Должны увидеть сообщение о подключении к API Gateway.

2. Обновите подписку в Hiddify/Happ — должны появиться серверы "Обходка".

---

## Как это работает

```
Телефон (VLESS-WS) ──WSS:443──► Яндекс API Gateway
                                      │
                                      ▼ (вызов Cloud Function)
                                Cloud Function
                                      │
                                      ▼ (WebSocket Management API)
                              API Gateway ──WS──► Adapter (Go, VPS)
                                                      │
                                                      ▼ (TCP)
                                                  Xray (VLESS)
```

* Для ТСПУ это обычный HTTPS/WSS трафик к серверам Яндекса
* IP-адреса Яндекса находятся в белом списке операторов
* Cloud Function — посредник, не хранит данные
* Adapter — лёгкий Go-бинарник, подключается к API Gateway и пробрасывает данные к Xray

## Безопасность

* Все пути замаскированы под API-запросы (`/api/v1/...`)
* console.log убраны из Cloud Function
* Переменные окружения используют нейтральные имена
* AUTH_TOKEN защищает от несанкционированного подключения
