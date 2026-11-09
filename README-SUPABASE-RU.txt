GIVORA — SUPABASE FOUNDATION v1

ЧТО ВНУТРИ
- Текущий интерфейс Givora (index.html, style.css, app.js).
- SQL-схема профилей, ролей, кошельков Givora Stars, журнала операций, подарков и заказов.
- Edge Function redeem-owner-code: проверяет подпись Telegram initData, допускает активацию только Telegram ID 5304264780, хранит только SHA-256-хеш кода на стороне Supabase и не допускает повторную активацию.

ВАЖНО: ЭТО НЕ ЗАВЕРШЁННЫЙ ПЕРЕНОС ПРИЛОЖЕНИЯ.
Текущий app.js всё ещё использует старые REST-маршруты /api/... . SQL и функция — безопасная основа для миграции, но каталог, покупки, история и админ-панель пока не переведены полностью на Supabase. Не заменяй рабочий сайт этим архивом, пока не завершена интеграция и тестирование.

НАСТРОЙКА SUPABASE (ВЫПОЛНЯТЬ С ОТВЕТСТВЕННЫМ ВЗРОСЛЫМ ДЛЯ ЛЮБЫХ ПЛАТЕЖЕЙ)
1. Создать проект Supabase.
2. В SQL Editor выполнить supabase/migrations/001_givora_core.sql.
3. В Project Settings → API взять Project URL и anon/public key; вписать их в config.js. anon key разрешено размещать во frontend только вместе с корректными RLS policies. service_role key никогда не размещать в браузере или GitHub.
4. Установить Supabase CLI, выполнить supabase link и deploy функции redeem-owner-code.
5. Добавить Edge Function secrets: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GIVORA_OWNER_CODE_SHA256.
6. Секретный 50-символьный код сгенерировать локально (не публиковать и не коммитить), вычислить SHA-256 и сохранить только хеш в GIVORA_OWNER_CODE_SHA256. Код, который ранее показывался в переписке, считать скомпрометированным и не использовать.
7. Только после подключения клиентского кода добавить интерфейс ввода промокода в профиль и вызвать функцию с Telegram initData. Проверить на отдельном тестовом проекте.

РОЛИ
- Предназначенный владелец: Telegram ID 5304264780.
- Функция промокода выдаёт owner только этому ID и только один раз.
- Нельзя выдавать права по username: он изменяемый.
- Для реальной защиты все проверки ролей должны выполняться на серверной стороне; скрытие кнопки в интерфейсе не является защитой.

ВАЛЮТА
Givora Stars — внутренняя учётная единица. Заявленный пользователем курс 1:1 сам по себе не создаёт платёжный механизм и не подтверждает денежную стоимость. Реальные пополнения/платежи в этом пакете НЕ реализованы. Не начислять баланс по клиентскому запросу; подтверждение платежей и финансовую настройку должен выполнять ответственный взрослый с соблюдением правил Telegram и применимых требований.

ПРОВЕРКА
- SQL migration reviewed for structure; live Supabase deployment not performed.
- Edge Function source included; not deployed or tested against a real project.
- Existing UI has not been fully migrated to Supabase; do not label this archive production-ready.
