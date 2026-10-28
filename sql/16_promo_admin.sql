-- Миграция 16: управление промокодами для владельца.
-- Выполнять после 15_subscription_and_promo.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- Что добавляется:
-- - promo_list(): список промокодов со счётчиком использований (только владелец);
-- - promo_history(p_code): кто и когда использовал промокод (только владелец);
-- - promo_create(...): создание промокода (только владелец).
-- Все проверки роли сделаны на сервере, скрытия кнопок недостаточно.

-- Список промокодов
create or replace function public.promo_list()
returns table (code text, months int, max_uses int, used_count int, expires_at timestamptz, active boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  return query
    select p.code, p.months, p.max_uses, p.used_count, p.expires_at, p.active, p.created_at
      from public.promo_codes p
     order by p.created_at desc;
end $$;

revoke execute on function public.promo_list() from public, anon;
grant execute on function public.promo_list() to authenticated;

-- История использования одного промокода: кто и когда
create or replace function public.promo_history(p_code text)
returns table (username text, full_name text, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  return query
    select pr.username, pr.full_name, r.redeemed_at
      from public.promo_redemptions r
      join public.profiles pr on pr.id = r.client_id
     where r.code = upper(trim(coalesce(p_code,'')))
     order by r.redeemed_at desc;
end $$;

revoke execute on function public.promo_history(text) from public, anon;
grant execute on function public.promo_history(text) to authenticated;

-- Создание промокода. p_max_uses = null означает без ограничения числа использований.
create or replace function public.promo_create(p_code text, p_months int, p_max_uses int, p_expires_at timestamptz)
returns text
language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(coalesce(p_code,'')));
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  if v_code !~ '^[A-Z0-9_-]{4,40}$' then
    raise exception 'Промокод: 4–40 символов, латинские буквы, цифры, «-» или «_»';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'Срок: от 1 до 36 месяцев'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'Лимит использований должен быть не меньше 1'; end if;
  insert into public.promo_codes (code, months, max_uses, expires_at)
    values (v_code, p_months, p_max_uses, p_expires_at);
  return v_code;
exception when unique_violation then
  raise exception 'Такой промокод уже существует';
end $$;

revoke execute on function public.promo_create(text, int, int, timestamptz) from public, anon;
grant execute on function public.promo_create(text, int, int, timestamptz) to authenticated;

-- Включить / выключить промокод без удаления (сохраняет историю)
create or replace function public.promo_set_active(p_code text, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  update public.promo_codes set active = p_active where code = upper(trim(coalesce(p_code,'')));
  if not found then raise exception 'Промокод не найден'; end if;
end $$;

revoke execute on function public.promo_set_active(text, boolean) from public, anon;
grant execute on function public.promo_set_active(text, boolean) to authenticated;
