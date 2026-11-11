GIVORA — SUPABASE INTEGRATION BUILD

Состав:
- фронтенд на основе дизайна v7;
- Supabase Edge Function givora-api с проверкой подписи Telegram initData;
- SQL migration: профили, кошельки, журнал операций, каталог, заявки, заказы, инвентарь, промокоды;
- промокоды: создание владельцем, бонус, лимит использований, срок действия, одно использование на аккаунт;
- каталог публикуется только после ручной проверки подарка, отправленного на @GivoraStore;
- покупки списывают внутренние Givora Stars; реальную передачу Telegram-подарка выполняет администратор вручную.

ВАЖНО:
Это интеграционный кандидат, не запущенный production-сервис. Перед реальным использованием обязательны настройка Supabase, тестирование транзакций/гонок, проверка Telegram Bot API и настройка мониторинга. Встроенная единица Givora Stars не является Telegram Stars и не поддерживает вывод или реальные платежи. Не подключайте реальные платежи без ответственного взрослого и юридической проверки.

Настройка:
1. Создать Supabase project.
2. В SQL Editor выполнить supabase/migrations/001_givora_core.sql.
3. В Edge Functions создать функцию givora-api и загрузить supabase/functions/givora-api/index.ts.
4. Установить Secrets функции:
   BOT_TOKEN — токен Telegram-бота;
   SUPABASE_URL — URL проекта;
   SUPABASE_SERVICE_ROLE_KEY — service role key (секрет, только в Supabase);
   OWNER_TELEGRAM_ID — 5304264780.
5. В config.js указать Project URL и anon/public key. Не помещать service role key или bot token в config.js/GitHub.
6. Сохранить фронтенд в существующий Render Static Site, не меняя URL Mini App.
7. Протестировать вход, заявки, промокоды, покупку, возврат и запрет доступа к админке с обычного Telegram-аккаунта.

Фактическая передача Telegram NFT не автоматизирована. Статус delivered можно выставлять только после ручной проверки реальной отправки.
