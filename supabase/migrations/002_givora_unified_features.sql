
-- Givora unified virtual inventory and admin operations (safe to apply more than once)
alter table public.inventory add column if not exists image_url text;
alter table public.inventory add column if not exists listed_at timestamptz;
create index if not exists inventory_user_status_idx on public.inventory(telegram_id,status,created_at desc);
create index if not exists gifts_seller_active_idx on public.gifts(seller_telegram_id,active);

create or replace function public.givora_admin_issue_gift(p_user bigint,p_name text,p_image_url text)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if p_name is null or length(trim(p_name))=0 or length(p_name)>100 then raise exception 'Некорректное название подарка'; end if;
 if p_image_url !~* '^https://' then raise exception 'Нужна HTTPS-ссылка на изображение'; end if;
 if not exists(select 1 from profiles where telegram_id=p_user) then raise exception 'Пользователь не найден: он должен хотя бы раз открыть Givora'; end if;
 insert into inventory(telegram_id,gift_name,image_url,status)
 values(p_user,trim(p_name),p_image_url,'available') returning id into new_id;
 return new_id;
end $$;

create or replace function public.givora_admin_credit(p_user bigint,p_amount bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_amount<=0 or p_amount>1000000 then raise exception 'Некорректная сумма'; end if;
 update wallets set balance=balance+p_amount,updated_at=now() where telegram_id=p_user;
 if not found then raise exception 'Кошелёк пользователя не найден'; end if;
 insert into ledger(telegram_id,amount,kind,reference,note)
 values(p_user,p_amount,'admin_credit','admin:'||gen_random_uuid()::text,'Начисление владельцем Givora');
end $$;

create or replace function public.givora_publish_inventory(p_user bigint,p_item uuid,p_price bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare i inventory%rowtype; gid uuid;
begin
 if p_price<=0 then raise exception 'Цена должна быть больше нуля'; end if;
 select * into i from inventory where id=p_item and telegram_id=p_user for update;
 if i.id is null or i.status<>'available' then raise exception 'Подарок недоступен или уже выставлен'; end if;
 insert into gifts(name,gift_url,image_url,price,seller_telegram_id,active)
 values(i.gift_name,i.gift_url,i.image_url,p_price,p_user,true) returning id into gid;
 update inventory set gift_id=gid,status='listed',listed_at=now() where id=i.id;
 return gid;
end $$;

create or replace function public.givora_finish_order(p_order uuid,p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; g gifts%rowtype;
begin
 select * into o from orders where id=p_order for update;
 if o.id is null or o.status<>'pending_delivery' then raise exception 'Заказ уже обработан'; end if;
 if p_action='refund' then
   update wallets set balance=balance+o.amount,updated_at=now() where telegram_id=o.buyer_telegram_id;
   insert into ledger(telegram_id,amount,kind,reference,note) values(o.buyer_telegram_id,o.amount,'refund','refund:'||o.id::text,'Возврат по заказу');
   update gifts set active=true where id=o.gift_id;
   update orders set status='refunded',completed_at=now() where id=o.id;
 elsif p_action='delivered' then
   select * into g from gifts where id=o.gift_id for update;
   if g.id is null then raise exception 'Подарок не найден'; end if;
   insert into inventory(telegram_id,gift_id,gift_name,gift_url,image_url,order_id,status)
   values(coalesce(o.recipient_telegram_id,o.buyer_telegram_id),g.id,g.name,g.gift_url,g.image_url,o.id,'available');
   update gifts set active=false where id=g.id;
   if g.seller_telegram_id is not null then
     update wallets set balance=balance+o.amount,updated_at=now() where telegram_id=g.seller_telegram_id;
     insert into ledger(telegram_id,amount,kind,reference,note) values(g.seller_telegram_id,o.amount,'sale','sale:'||o.id::text,'Продажа виртуального подарка Givora');
   end if;
   update orders set status='delivered',completed_at=now() where id=o.id;
 else raise exception 'Неизвестное действие'; end if;
end $$;

revoke all on function public.givora_admin_issue_gift(bigint,text,text) from public,anon,authenticated;
revoke all on function public.givora_admin_credit(bigint,bigint) from public,anon,authenticated;
revoke all on function public.givora_publish_inventory(bigint,uuid,bigint) from public,anon,authenticated;
revoke all on function public.givora_finish_order(uuid,text) from public,anon,authenticated;
grant execute on function public.givora_admin_issue_gift(bigint,text,text) to service_role;
grant execute on function public.givora_admin_credit(bigint,bigint) to service_role;
grant execute on function public.givora_publish_inventory(bigint,uuid,bigint) to service_role;
grant execute on function public.givora_finish_order(uuid,text) to service_role;


create or replace function public.givora_purchase(p_user bigint,p_gift uuid,p_recipient text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare w wallets%rowtype; g gifts%rowtype; oid uuid; recipient_id bigint;
begin
 select * into w from wallets where telegram_id=p_user for update;
 select * into g from gifts where id=p_gift and active=true for update;
 if g.id is null then raise exception 'Подарок недоступен'; end if;
 if w.telegram_id is null or w.balance<g.price then raise exception 'Недостаточно Givora Stars'; end if;
 if p_recipient is not null then
   select telegram_id into recipient_id from profiles where lower(username)=lower(trim(leading '@' from p_recipient)) limit 1;
   if recipient_id is null then raise exception 'Получатель не найден: он должен открыть Givora'; end if;
 end if;
 update wallets set balance=balance-g.price,updated_at=now() where telegram_id=p_user;
 insert into orders(buyer_telegram_id,recipient_telegram_id,recipient_username,gift_id,amount)
 values(p_user,recipient_id,nullif(p_recipient,''),g.id,g.price) returning id into oid;
 update gifts set active=false where id=g.id;
 insert into ledger(telegram_id,amount,kind,reference,note)
 values(p_user,-g.price,'purchase','order:'||oid::text,'Покупка '||g.name);
 return oid;
end $$;
revoke all on function public.givora_purchase(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.givora_purchase(bigint,uuid,text) to service_role;
