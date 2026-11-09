
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 telegram_id bigint primary key, username text, first_name text, last_name text, photo_url text,
 role text not null default 'user' check(role in ('user','moderator','owner')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.wallets (
 telegram_id bigint primary key references public.profiles(telegram_id) on delete cascade,
 balance bigint not null default 0 check(balance>=0), updated_at timestamptz not null default now()
);
create table if not exists public.ledger (
 id uuid primary key default gen_random_uuid(), telegram_id bigint not null references public.profiles(telegram_id),
 amount bigint not null, kind text not null, reference text unique, note text, created_at timestamptz not null default now()
);
create table if not exists public.gifts (
 id uuid primary key default gen_random_uuid(), name text not null, gift_id text, gift_url text, image_url text,
 price bigint not null check(price>0), seller_telegram_id bigint references public.profiles(telegram_id), active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.gift_requests (
 id uuid primary key default gen_random_uuid(), telegram_id bigint not null references public.profiles(telegram_id),
 username text, gift_name text not null default 'Подарок на проверке', gift_url text,
 price bigint not null default 1 check(price>0), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), buyer_telegram_id bigint not null references public.profiles(telegram_id),
 recipient_telegram_id bigint, recipient_username text, gift_id uuid not null references public.gifts(id),
 amount bigint not null check(amount>0), status text not null default 'pending_delivery' check(status in ('pending_delivery','delivered','refunded')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.inventory (
 id uuid primary key default gen_random_uuid(), telegram_id bigint not null references public.profiles(telegram_id),
 gift_id uuid references public.gifts(id), gift_name text not null, gift_url text, order_id uuid references public.orders(id),
 status text not null default 'awaiting_admin_delivery', created_at timestamptz not null default now()
);
create table if not exists public.promos (
 id uuid primary key default gen_random_uuid(), code text unique not null, bonus bigint not null check(bonus>0),
 usage_limit integer not null default 1 check(usage_limit>0), uses integer not null default 0,
 expires_at timestamptz, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.promo_redemptions (
 id uuid primary key default gen_random_uuid(), promo_id uuid not null references public.promos(id),
 telegram_id bigint not null references public.profiles(telegram_id), created_at timestamptz not null default now(),
 unique(promo_id,telegram_id)
);
create index if not exists gift_requests_status_idx on public.gift_requests(status);
create index if not exists orders_buyer_idx on public.orders(buyer_telegram_id);
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_requests enable row level security;
alter table public.orders enable row level security;
alter table public.inventory enable row level security;
alter table public.promos enable row level security;
alter table public.promo_redemptions enable row level security;
-- All reads/writes are proxied through the Edge Function using service-role credentials.
revoke all on all tables in schema public from anon, authenticated;


-- Atomic purchase: lock the wallet row so simultaneous purchases cannot overspend.
create or replace function public.givora_purchase(p_user bigint,p_gift uuid,p_recipient text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare w wallets%rowtype; g gifts%rowtype; oid uuid;
begin
 select * into w from wallets where telegram_id=p_user for update;
 select * into g from gifts where id=p_gift and active=true for update;
 if not found then raise exception 'Подарок недоступен'; end if;
 if w.telegram_id is null or w.balance<g.price then raise exception 'Недостаточно Givora Stars'; end if;
 update wallets set balance=balance-g.price,updated_at=now() where telegram_id=p_user;
 insert into orders(buyer_telegram_id,gift_id,amount,recipient_username)
 values(p_user,g.id,g.price,nullif(p_recipient,'')) returning id into oid;
 insert into ledger(telegram_id,amount,kind,reference,note)
 values(p_user,-g.price,'purchase','order:'||oid::text,'Покупка '||g.name);
 return oid;
end $$;

-- Atomic, one-redemption-per-user promo activation with global usage cap.
create or replace function public.givora_redeem_promo(p_user bigint,p_code text)
returns bigint language plpgsql security definer set search_path=public as $$
declare p promos%rowtype; bonus_value bigint;
begin
 select * into p from promos where code=upper(trim(p_code)) and active=true for update;
 if p.id is null or (p.expires_at is not null and p.expires_at<=now()) or p.uses>=p.usage_limit then
  raise exception 'Промокод недействителен или лимит исчерпан';
 end if;
 insert into promo_redemptions(promo_id,telegram_id) values(p.id,p_user);
 bonus_value:=p.bonus;
 update promos set uses=uses+1 where id=p.id;
 update wallets set balance=balance+bonus_value,updated_at=now() where telegram_id=p_user;
 insert into ledger(telegram_id,amount,kind,reference,note)
 values(p_user,bonus_value,'promo','promo:'||p.id::text||':'||p_user::text,'Промокод '||p.code);
 return bonus_value;
end $$;

revoke all on function public.givora_purchase(bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.givora_redeem_promo(bigint,text) from public, anon, authenticated;
grant execute on function public.givora_purchase(bigint,uuid,text) to service_role;
grant execute on function public.givora_redeem_promo(bigint,text) to service_role;

