-- Схема для сайта «Лиственница». Выполнить целиком в Supabase: SQL Editor -> New query -> Run.

-- ===== Таблицы =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  full_name text not null check (char_length(trim(full_name)) between 3 and 80),
  role text not null default 'client' check (role in ('client','designer','owner')),
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  designer_id uuid,
  status text not null default 'open' check (status in ('open','approved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_client_id_fkey foreign key (client_id) references public.profiles(id) on delete cascade,
  constraint conversations_designer_id_fkey foreign key (designer_id) references public.profiles(id) on delete set null
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sender_name text,
  sender_role text,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);

-- ===== Вспомогательные функции =====
create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Профиль создаётся автоматически при регистрации. Роль всегда 'client':
-- из данных регистрации она не читается, подделать её нельзя.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Менять роль может только владелец (или SQL Editor, где нет пользователя).
create function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role
     and coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'Нельзя менять роль';
  end if;
  new.id := old.id;
  return new;
end $$;
create trigger protect_profile_trg before update on public.profiles
  for each row execute function public.protect_profile();

-- Назначать дизайнера диалогу может только владелец.
create function public.protect_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id <> old.client_id then raise exception 'Нельзя менять клиента'; end if;
  if auth.uid() is not null and new.designer_id is distinct from old.designer_id
     and coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'Дизайнера назначает владелец';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger protect_conversation_trg before update on public.conversations
  for each row execute function public.protect_conversation();

-- Имя и роль отправителя фиксируются на сервере, подделать нельзя.
create function public.prepare_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  new.sender_id := auth.uid();
  new.sender_name := p.full_name;
  new.sender_role := p.role;
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;
create trigger prepare_message_trg before insert on public.messages
  for each row execute function public.prepare_message();

-- ===== Защита строк (Row Level Security) =====
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('owner','designer'));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy conv_select on public.conversations for select to authenticated
  using (client_id = auth.uid() or designer_id = auth.uid() or public.my_role() = 'owner');
create policy conv_insert on public.conversations for insert to authenticated
  with check (client_id = auth.uid() and designer_id is null);
create policy conv_update_client on public.conversations for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy conv_update_owner on public.conversations for update to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- Сообщения видны и доступны для записи только тем, кому виден диалог.
create policy msg_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy msg_insert on public.messages for insert to authenticated
  with check (exists (select 1 from public.conversations c where c.id = conversation_id));

-- ===== Функции для сайта =====
-- Вход по юзернейму: сайт узнаёт почту и входит обычным способом.
create function public.email_by_username(u text) returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email::text from auth.users au
  join public.profiles p on p.id = au.id
  where lower(p.username) = lower(u) limit 1
$$;

create function public.username_taken(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where lower(username) = lower(u))
$$;

create function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  if new_role not in ('client','designer') then raise exception 'Недопустимая роль'; end if;
  if target = auth.uid() then raise exception 'Нельзя менять свою роль'; end if;
  update public.profiles set role = new_role where id = target and role <> 'owner';
  if new_role = 'client' then
    update public.conversations set designer_id = null where designer_id = target;
  end if;
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if public.my_role() = 'owner' then raise exception 'Владелец не может удалить аккаунт'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.set_role(uuid, text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.email_by_username(text) to anon, authenticated;
grant execute on function public.username_taken(text) to anon, authenticated;

-- ===== Закрытие лишних прав (Security Advisor) =====
-- Триггерные функции должны срабатывать сами, вызывать их напрямую через API нельзя.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prepare_message() from public, anon, authenticated;
revoke execute on function public.protect_conversation() from public, anon, authenticated;
revoke execute on function public.protect_profile() from public, anon, authenticated;
-- Функция нужна правилам доступа только для вошедших пользователей.
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- ===== Сообщения в реальном времени =====
alter publication supabase_realtime add table public.messages, public.conversations;

-- ===== Владелец =====
-- 1) Зарегистрируйтесь на сайте как обычный пользователь.
-- 2) Выполните (подставьте свой юзернейм):
-- update public.profiles set role = 'owner' where lower(username) = lower('ВАШ_ЮЗЕРНЕЙМ');
