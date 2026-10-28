-- Миграция 13: роль «креативный дизайнер» и управляемый список готовых домов.
-- Выполнить в Supabase: SQL Editor -> New query -> Run, целиком. Можно запускать повторно.
--
-- Креативный дизайнер видит только раздел «Готовые дома» в панели команды и может добавлять,
-- менять, скрывать и удалять готовые дома. Владелец может всё то же самое.
-- Клиентские проекты, диалоги и обращения креативному дизайнеру недоступны (политики не меняются).

-- ===== 1. Роль «creative» =====
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
  add constraint profiles_role_check check (role in ('client','manager','designer','creative','owner'));

-- Владелец назначает роли «менеджер», «дизайнер», «креативный дизайнер» или снимает их (роль «клиент»).
create or replace function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  if new_role not in ('client','manager','designer','creative') then raise exception 'Недопустимая роль'; end if;
  if target = auth.uid() then raise exception 'Нельзя менять свою роль'; end if;
  update public.profiles set role = new_role where id = target and role <> 'owner';
  -- Если человек перестал быть дизайнером, он теряет доступ к диалогам клиентов.
  if new_role <> 'designer' then
    update public.conversations set designer_id = null where designer_id = target;
  end if;
end $$;

-- ===== 2. Готовые дома =====
-- config — проект в формате v:2 (как projects.config), поэтому дом открывается тем же загрузчиком.
create table if not exists public.ready_homes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  note text not null default '' check (char_length(note) <= 300),
  base text not null check (base in ('les','oz','sem')),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 200000),
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ready_homes enable row level security;

-- Посетители видят опубликованные дома; владелец и креативный дизайнер видят все.
drop policy if exists ready_homes_select on public.ready_homes;
create policy ready_homes_select on public.ready_homes for select to anon, authenticated
  using (published or public.my_role() in ('owner','creative'));

drop policy if exists ready_homes_insert on public.ready_homes;
create policy ready_homes_insert on public.ready_homes for insert to authenticated
  with check (public.my_role() in ('owner','creative'));

drop policy if exists ready_homes_update on public.ready_homes;
create policy ready_homes_update on public.ready_homes for update to authenticated
  using (public.my_role() in ('owner','creative'))
  with check (public.my_role() in ('owner','creative'));

drop policy if exists ready_homes_delete on public.ready_homes;
create policy ready_homes_delete on public.ready_homes for delete to authenticated
  using (public.my_role() in ('owner','creative'));

grant select on public.ready_homes to anon, authenticated;
grant insert, update, delete on public.ready_homes to authenticated;
