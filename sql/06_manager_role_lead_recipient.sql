-- Миграция 6: роль «менеджер» и адресат обращений (менеджер или дизайнер).
-- Выполнять после 05_lead_topic.sql, целиком, в SQL Editor. Файл можно запускать повторно.
--
-- ВАЖНО: раньше дизайнеры видели все обращения. После миграции каждое обращение видит только тот,
-- кому оно адресовано (менеджер или дизайнер), и владелец видит все. Уже существующие обращения
-- получают адресата «менеджер»: при необходимости владелец может передать их дизайнеру в панели.

-- ===== 1. Роль «менеджер» =====
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles
  add constraint profiles_role_check check (role in ('client','manager','designer','owner'));

-- Владелец назначает роли «менеджер», «дизайнер» или снимает их (роль «клиент»).
create or replace function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  if new_role not in ('client','manager','designer') then raise exception 'Недопустимая роль'; end if;
  if target = auth.uid() then raise exception 'Нельзя менять свою роль'; end if;
  update public.profiles set role = new_role where id = target and role <> 'owner';
  -- Если человек перестал быть дизайнером, он теряет доступ к диалогам клиентов.
  if new_role <> 'designer' then
    update public.conversations set designer_id = null where designer_id = target;
  end if;
end $$;

-- Менеджеры видят имена сотрудников (чтобы в обращении было видно, кто взял его в работу).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.my_role() in ('owner','designer')
    or (public.my_role() = 'manager' and role in ('owner','manager','designer'))
  );

-- ===== 2. Адресат обращений =====
alter table public.leads add column if not exists topic text;
alter table public.leads add column if not exists recipient text not null default 'manager';
alter table public.leads drop constraint if exists leads_recipient_check;
alter table public.leads add constraint leads_recipient_check check (recipient in ('manager','designer'));
create index if not exists leads_recipient_idx on public.leads (recipient, status, created_at desc);

drop policy if exists leads_select on public.leads;
drop policy if exists leads_update on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'manager'  and recipient = 'manager')
    or (public.my_role() = 'designer' and recipient = 'designer')
  );
-- Видеть обращение может только адресат (using), но передать его другому адресату может любой сотрудник (with check).
create policy leads_update on public.leads for update to authenticated
  using (
    public.my_role() = 'owner'
    or (public.my_role() = 'manager'  and recipient = 'manager')
    or (public.my_role() = 'designer' and recipient = 'designer')
  )
  with check (public.my_role() in ('owner','manager','designer'));

-- Сотрудник может менять статус, «кто взял» и адресата (передача). Имя, телефон и тема защищены.
create or replace function public.protect_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.name <> old.name or new.phone <> old.phone or new.user_id is distinct from old.user_id
     or new.created_at <> old.created_at or new.topic is distinct from old.topic then
    raise exception 'Менять можно только статус и адресата';
  end if;
  if new.taken_by is distinct from old.taken_by and new.taken_by is not null
     and new.taken_by <> auth.uid() and coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'Взять в работу можно только на себя';
  end if;
  return new;
end $$;