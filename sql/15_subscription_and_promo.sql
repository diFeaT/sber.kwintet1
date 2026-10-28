-- Миграция 15: подписка клиента и промокоды.
-- Выполнять после 14_free_trial_project.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- Что меняется:
-- - client_subscriptions: одна запись на клиента, дата окончания подписки paid_until;
-- - promo_codes / promo_redemptions: промокоды (выдача месяца подписки), один раз на клиента;
-- - submit_project: второй и последующие новые проекты клиента разрешены только при активной подписке;
-- - клиент не может писать в таблицы напрямую: продление делает только функция.
-- Оплата пока не подключена: продлевать можно промокодом. Функция extend_subscription
-- будет вызываться платёжным обработчиком после подключения оплаты.

-- ===== Подписка =====
create table if not exists public.client_subscriptions (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  paid_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.client_subscriptions enable row level security;
-- клиент читает только свою подписку (через функцию my_subscription), писать напрямую нельзя
revoke all on public.client_subscriptions from anon, authenticated;

create or replace function public.extend_subscription(p_client uuid, p_months int, p_source text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'Некорректный срок подписки'; end if;
  insert into public.client_subscriptions (client_id, paid_until) values (p_client, now())
    on conflict (client_id) do nothing;
  update public.client_subscriptions
     set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(months => p_months),
         updated_at = now()
   where client_id = p_client
   returning paid_until into v_until;
  return v_until;
end $$;

revoke execute on function public.extend_subscription(uuid, int, text) from public, anon, authenticated;

create or replace function public.my_subscription()
returns table (paid_until timestamptz, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  return query
    select s.paid_until, (s.paid_until is not null and s.paid_until > now())
      from public.client_subscriptions s where s.client_id = auth.uid()
    union all
    select null::timestamptz, false
     where not exists (select 1 from public.client_subscriptions s where s.client_id = auth.uid())
     limit 1;
end $$;

revoke execute on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;

-- ===== Промокоды =====
create table if not exists public.promo_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 40),
  months int not null check (months between 1 and 36),
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  code text not null references public.promo_codes(code) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, client_id)
);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
-- таблицы промокодов недоступны клиентам напрямую: только через функции ниже
revoke all on public.promo_codes from anon, authenticated;
revoke all on public.promo_redemptions from anon, authenticated;

-- Один промокод на клиента. Ошибки одинаковые, чтобы не перебирать коды.
create or replace function public.redeem_promo(p_code text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(coalesce(p_code,''))); v_promo public.promo_codes; v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  select * into v_promo from public.promo_codes where code = v_code for update;
  if not found or not v_promo.active
     or (v_promo.expires_at is not null and v_promo.expires_at < now())
     or (v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses) then
    raise exception 'Промокод не найден или больше не действует';
  end if;
  insert into public.promo_redemptions (code, client_id) values (v_code, auth.uid());
  update public.promo_codes set used_count = used_count + 1 where code = v_code;
  v_until := public.extend_subscription(auth.uid(), v_promo.months, 'promo:' || v_code);
  return v_until;
exception when unique_violation then
  raise exception 'Вы уже использовали этот промокод';
end $$;

revoke execute on function public.redeem_promo(text) from public, anon;
grant execute on function public.redeem_promo(text) to authenticated;

-- Стартовый промокод: один месяц бесплатно. Владелец может добавлять свои через SQL Editor.
insert into public.promo_codes (code, months, max_uses)
  values ('LISTVENNITSA1', 1, null)
  on conflict (code) do nothing;

-- ===== Лимит проектов: подписка нужна со второго проекта =====
create or replace function public.submit_project(p_id uuid, p_title text, p_config jsonb, p_price numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_id uuid; v_status text; v_designer uuid; v_title text := left(trim(coalesce(p_title,'')), 80);
        v_role text; v_used int; v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if v_title = '' then raise exception 'Введите название проекта'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or octet_length(p_config::text) > 200000 then
    raise exception 'Некорректный проект';
  end if;

  if p_id is not null then
    select status, conversation_id into v_status, v_conv from public.projects where id = p_id and client_id = auth.uid();
    if not found then raise exception 'Проект не найден'; end if;
    if v_status = 'paid' then raise exception 'Оплаченный проект нельзя изменить'; end if;
    update public.projects
       set title = v_title, config = p_config, price = coalesce(p_price,0), status = 'submitted',
           review_note = null, calc = null, approved_at = null, approved_by = null,
           submitted_at = now(), updated_at = now()
     where id = p_id returning id into v_id;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» обновлён и снова отправлен на согласование.');
  else
    -- новый проект: клиент получает один пробный, далее нужна активная подписка
    select role into v_role from public.profiles where id = auth.uid();
    if coalesce(v_role, 'client') = 'client' then
      insert into public.client_quota (client_id, projects_created) values (auth.uid(), 0)
        on conflict (client_id) do nothing;
      select projects_created into v_used from public.client_quota where client_id = auth.uid() for update;
      if v_used >= 1 then
        select paid_until into v_until from public.client_subscriptions where client_id = auth.uid();
        if v_until is null or v_until <= now() then
          raise exception 'Бесплатный пробный проект уже использован. Для новых проектов нужна подписка.';
        end if;
      end if;
      update public.client_quota set projects_created = projects_created + 1 where client_id = auth.uid();
    end if;

    -- новый чат
    select c.designer_id into v_designer
      from public.conversations c
      join public.profiles d on d.id = c.designer_id and d.role = 'designer'
     where c.client_id = auth.uid()
     order by c.updated_at desc limit 1;
    insert into public.conversations (client_id, designer_id)
      values (auth.uid(), v_designer) returning id into v_conv;
    insert into public.projects (client_id, conversation_id, title, config, price)
      values (auth.uid(), v_conv, v_title, p_config, coalesce(p_price,0)) returning id into v_id;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» отправлен на согласование.');
  end if;
  return v_id;
end $$;

revoke execute on function public.submit_project(uuid, text, jsonb, numeric) from public, anon;
grant execute on function public.submit_project(uuid, text, jsonb, numeric) to authenticated;
