-- Миграция 4: вход и регистрация по номеру телефона и паролю (без SMS).
-- Выполнять после 03_delete_project.sql, целиком, в SQL Editor. Файл можно запускать повторно.
-- Номер НЕ подтверждается кодом: он служит только логином.

-- ===== Телефон в профиле =====
alter table public.profiles add column if not exists phone text;
create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null;

-- Профиль создаётся и при регистрации по телефону (там нет ни почты, ни юзернейма):
-- выдаётся временный юзернейм вида u1a2b3c4d5e6f, имя берётся из формы регистрации.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user  text := new.raw_user_meta_data->>'username';
  v_name  text := new.raw_user_meta_data->>'full_name';
  v_phone text := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
begin
  if v_user is null or v_user = '' then
    v_user := 'u' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  if v_name is null or char_length(trim(v_name)) < 3 then
    v_name := 'Клиент';
  end if;
  insert into public.profiles (id, username, full_name, phone)
  values (new.id, v_user, v_name, case when v_phone is null then null else '+' || v_phone end);
  return new;
end $$;

-- Когда номер добавлен или изменён в аккаунте, он копируется в профиль (его видят дизайнеры).
create or replace function public.sync_profile_phone() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
begin
  update public.profiles
     set phone = case when v_phone is null then null else '+' || v_phone end
   where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_phone_changed on auth.users;
create trigger on_auth_user_phone_changed after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function public.sync_profile_phone();
revoke execute on function public.sync_profile_phone() from public, anon, authenticated;

-- Номер в профиле нельзя подменить напрямую через таблицу: он меняется только вместе с аккаунтом.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role
     and coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'Нельзя менять роль';
  end if;
  if auth.uid() is not null and new.phone is distinct from old.phone then
    raise exception 'Номер телефона меняется только в настройках аккаунта';
  end if;
  new.id := old.id;
  return new;
end $$;

-- Номера, которые уже есть в аккаунтах, переносим в профили.
update public.profiles p
   set phone = '+' || regexp_replace(u.phone, '\D', '', 'g')
  from auth.users u
 where u.id = p.id and p.phone is null
   and nullif(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), '') is not null;

-- Уборка: если раньше запускалась черновая версия этой миграции с SMS, убираем её следы.
drop function if exists public.sms_allow(text, int, int);
drop table if exists public.sms_log;