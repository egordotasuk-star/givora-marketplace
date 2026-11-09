GIVORA — Release Candidate v1 (на базе v7)
==========================================

СОСТАВ
------
index.html / style.css / app.js — Mini App, дизайн v7 сохранён
config.js — адрес API (обязательно заменить placeholder)
server.js / package.json — сервер Express + PostgreSQL
.gitignore — исключает секреты и node_modules

ЧТО РАБОТАЕТ В КОДЕ
-------------------
• Авторизация через Telegram Mini App initData с серверной проверкой подписи и срока действия.
• Роль администратора проверяется на сервере по числовому Telegram ID.
• Общие профили и баланс Givora Stars в PostgreSQL.
• Ручное начисление Givora Stars администратором.
• Каталог подарков, заявки пользователей, одобрение/отклонение, снятие объявлений.
• Покупка за Givora Stars с атомарным списанием баланса.
• Покупатель может указать Telegram username получателя; подарок появляется в его инвентаре после создания заказа.
• Заказ получает статус ожидания доставки. Администратор вручную отправляет настоящий Telegram-подарок и подтверждает доставку.
• Только после подтверждения доставки продавцу начисляется сумма в Givora Stars.
• Администратор может вернуть баланс покупателю при невыполненной доставке.
• История, инвентарь и журнал операций.
• Уведомления администратору о новых заявках через Telegram-бота (бот должен быть предварительно запущен администратором).

ВАЖНО
-----
Givora Stars — внутренняя единица маркетплейса, а НЕ Telegram Stars. Сейчас нет покупки/пополнения настоящими Telegram Stars, TON-платежей и вывода средств.
Настоящие Telegram-подарки автоматически не переводятся: отправку выполняет администратор вручную через Telegram, затем подтверждает заказ в админ-панели.
Не размещай подарок в каталоге, пока он действительно не получен на аккаунт GivoraStore и не проверен.
Это release candidate для технического тестирования, не подтверждённый глобальный коммерческий запуск. До публичного приёма пользователей взрослый ответственный оператор должен проверить применимые законы, возрастные ограничения, условия продажи цифровых активов, налоги, возвраты, поддержку и требования платёжных провайдеров.

НАСТРОЙКА RENDER
---------------
Нужны два сервиса:
1) PostgreSQL (можно использовать существующую базу Givora).
2) Web Service для API из этого же репозитория.

Настройки Web Service:
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Node: 18+

Environment Variables в Render Web Service:
DATABASE_URL        — connection string PostgreSQL (секрет)
BOT_TOKEN           — токен @GivoraappBot (секрет)
ADMIN_TELEGRAM_ID   — числовой Telegram ID владельца @harmonydurov
FRONTEND_ORIGIN     — точный публичный URL текущего Render Static Site без завершающего /

ADMIN_TELEGRAM_ID НЕ ПРИСЫЛАЙ В ЧАТ и не помещай в GitHub. Узнай числовой ID надёжным способом и введи его прямо в Render Environment. Username не подходит для серверной авторизации, так как его можно сменить.
BOT_TOKEN и DATABASE_URL также храни только в Render Environment. Если пароль базы ранее публиковался в чате, сначала смени его в Render.

СЕРВЕР АВТОМАТИЧЕСКИ СОЗДАЁТ И ОБНОВЛЯЕТ ТАБЛИЦЫ ПРИ СТАРТЕ.
Публичный endpoint для инициализации БД отсутствует.

НАСТРОЙКА ФРОНТЕНДА
-------------------
Открой config.js и замени:
window.GIVORA_API_BASE = "https://YOUR-API.onrender.com";
на публичный адрес Render Web Service (API), например https://имя-api-сервиса.onrender.com.
Это НЕ адрес статического сайта.

В тот же GitHub-репозиторий загрузи/замени index.html, style.css, app.js, config.js, server.js, package.json, .gitignore и README-DEPLOY.txt.
Render Static Site должен публиковать текущую корневую папку. Существующую ссылку Mini App в BotFather оставь прежней.
Render Web Service должен использовать команду npm start.

ПРОВЕРКА ПЕРЕД ПУБЛИКАЦИЕЙ
---------------------------
1) Открой https://АДРЕС-API/api/health — ожидается JSON ok:true.
2) Открой Mini App через Telegram — внизу должно быть «Подключено к Givora».
3) Проверь вход админом и обычным тестовым аккаунтом: админ-панель должна быть доступна только владельцу.
4) Создай тестовое объявление и проверь покупку с тестовым внутренним балансом.
5) Проверь статус pending_delivery, доставку, подтверждение, начисление продавцу.
6) Проверь возврат.
7) Убедись, что отклонённая заявка не попадает в каталог.
8) Сделай резервную копию БД до любого публичного запуска.

НЕЛЬЗЯ размещать BOT_TOKEN, DATABASE_URL или ADMIN_TELEGRAM_ID в клиентском JavaScript, HTML или GitHub.


MODERATOR TERM (v1)
- On the first successful server startup after this update, the account configured as ADMIN_TELEGRAM_ID receives a one-year moderator-role record.
- The expiry is stored in PostgreSQL and is not extended by ordinary server restarts.
- The moderator role can review gift-submission requests and hide active listings. Financial actions (balance credits, delivery confirmation, refunds, user administration) remain admin-only.
- The role is checked server-side; changing browser JavaScript cannot grant moderator permissions.
- The profile displays the moderator status. The configured ADMIN_TELEGRAM_ID account remains the administrator as well.
