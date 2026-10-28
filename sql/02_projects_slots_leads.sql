-- Миграция 2: проекты на согласовании, записи на консультацию, обращения с формы.
-- Выполнять ПОСЛЕ schema.sql, целиком, в Supabase: SQL Editor -> New query -> Run.

-- ===== Проекты =====
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  conversation_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 80),
  config jsonb not null,
  price numeric not null default 0,            -- цена модулей из конструктора (ориентир)
  status text not null default 'submitted'
    check (status in ('submitted','revision','approved','paid')),
  review_note text,
  calc jsonb,                                  -- полный расчёт, фиксируется при согласовании
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  updated_at timestamptz not null default now(),
  constraint projects_client_id_fkey foreign key (client_id) references public.profiles(id) on delete cascade,
  constraint projects_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint projects_approved_by_fkey foreign key (approved_by) references public.profiles(id) on delete set null
);
create index projects_client_idx on public.projects (client_id, submitted_at desc);
create index projects_conv_idx on public.projects (conversation_id);

alter table public.projects enable row level security;
-- Читать: клиент свои, владелец все, дизайнер проекты своих диалогов.
-- Записывать напрямую нельзя: только через функции submit_project / review_project.
create policy projects_select on public.projects for select to authenticated
  using (
    client_id = auth.uid()
    or public.my_role() = 'owner'
    or exists (select 1 from public.conversations c where c.id = conversation_id and c.designer_id = auth.uid())
  );

-- Клиент отправляет проект на согласование (новый или обновлённый).
create function public.submit_project(p_id uuid, p_title text, p_config jsonb, p_price numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_id uuid; v_status text; v_title text := left(trim(coalesce(p_title,'')), 80);
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
    select id into v_conv from public.conversations
      where client_id = auth.uid() and status <> 'closed' order by created_at desc limit 1;
    if v_conv is null then
      insert into public.conversations (client_id) values (auth.uid()) returning id into v_conv;
    end if;
    insert into public.projects (client_id, conversation_id, title, config, price)
      values (auth.uid(), v_conv, v_title, p_config, coalesce(p_price,0)) returning id into v_id;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» отправлен на согласование.');
  end if;
  return v_id;
end $$;

-- Дизайнер (с доступом к диалогу) или владелец согласовывает проект либо возвращает на доработку.
create function public.review_project(p_id uuid, p_decision text, p_note text, p_calc jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_title text; v_note text := nullif(trim(coalesce(p_note,'')), '');
begin
  if coalesce(public.my_role(),'') not in ('owner','designer') then raise exception 'Только для команды'; end if;
  select conversation_id, title into v_conv, v_title from public.projects where id = p_id;
  if not found then raise exception 'Проект не найден'; end if;
  if public.my_role() = 'designer'
     and not exists (select 1 from public.conversations where id = v_conv and designer_id = auth.uid()) then
    raise exception 'Нет доступа к этому проекту';
  end if;

  if p_decision = 'approved' then
    if p_calc is null or jsonb_typeof(p_calc) <> 'object' or octet_length(p_calc::text) > 200000 then
      raise exception 'Нужен корректный расчёт';
    end if;
    update public.projects
       set status = 'approved', calc = p_calc, review_note = v_note,
           approved_at = now(), approved_by = auth.uid(), updated_at = now()
     where id = p_id and status = 'submitted';
    if not found then raise exception 'Проект уже обработан'; end if;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» согласован. Полный расчёт и стоимость доступны в личном кабинете, раздел «Мои проекты».');
  elsif p_decision = 'revision' then
    if v_note is null then raise exception 'Напишите, что нужно доработать'; end if;
    update public.projects
       set status = 'revision', review_note = v_note, updated_at = now()
     where id = p_id and status = 'submitted';
    if not found then raise exception 'Проект уже обработан'; end if;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» возвращён на доработку: ' || v_note);
  else
    raise exception 'Неизвестное решение';
  end if;
end $$;

-- ===== Обращения с формы внизу главной страницы =====
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  phone text not null check (char_length(trim(phone)) between 5 and 30),
  user_id uuid default auth.uid(),
  status text not null default 'new' check (status in ('new','in_work','done')),
  taken_by uuid,
  created_at timestamptz not null default now(),
  constraint leads_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null,
  constraint leads_taken_by_fkey foreign key (taken_by) references public.profiles(id) on delete set null
);
create index leads_status_idx on public.leads (status, created_at desc);

alter table public.leads enable row level security;
-- Оставить заявку может любой посетитель (в том числе без входа).
create policy leads_insert on public.leads for insert to anon, authenticated
  with check (status = 'new' and taken_by is null and (user_id is null or user_id = auth.uid()));
create policy leads_select on public.leads for select to authenticated
  using (public.my_role() in ('owner','designer'));
create policy leads_update on public.leads for update to authenticated
  using (public.my_role() in ('owner','designer'))
  with check (public.my_role() in ('owner','designer'));

create function public.protect_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.name <> old.name or new.phone <> old.phone or new.user_id is distinct from old.user_id
     or new.created_at <> old.created_at then
    raise exception 'Менять можно только статус';
  end if;
  if new.taken_by is distinct from old.taken_by and new.taken_by is not null
     and new.taken_by <> auth.uid() and coalesce(public.my_role(),'') <> 'owner' then
    raise exception 'Взять в работу можно только на себя';
  end if;
  return new;
end $$;
create trigger protect_lead_trg before update on public.leads
  for each row execute function public.protect_lead();

-- ===== Записи на консультацию (слот = 1 час) =====
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  designer_id uuid,
  project_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  topic text check (topic is null or char_length(topic) <= 500),
  status text not null default 'booked' check (status in ('booked','cancelled','done')),
  created_at timestamptz not null default now(),
  constraint bookings_client_id_fkey foreign key (client_id) references public.profiles(id) on delete cascade,
  constraint bookings_designer_id_fkey foreign key (designer_id) references public.profiles(id) on delete set null,
  constraint bookings_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null,
  constraint bookings_one_hour check (ends_at = starts_at + interval '1 hour')
);
create unique index bookings_client_slot on public.bookings (client_id, starts_at) where status = 'booked';
create index bookings_start_idx on public.bookings (starts_at);

alter table public.bookings enable row level security;
create policy bookings_select on public.bookings for select to authenticated
  using (client_id = auth.uid() or public.my_role() in ('owner','designer'));
create policy bookings_update_staff on public.bookings for update to authenticated
  using (public.my_role() in ('owner','designer'))
  with check (public.my_role() in ('owner','designer'));

create function public.protect_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.client_id <> old.client_id or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at
     or new.project_id is distinct from old.project_id or new.topic is distinct from old.topic then
    raise exception 'Менять можно только статус и дизайнера';
  end if;
  if new.designer_id is distinct from old.designer_id and new.designer_id is not null
     and new.designer_id <> auth.uid() and coalesce(public.my_role(),'') <> 'owner' then
    raise exception 'Дизайнер может назначить только себя';
  end if;
  return new;
end $$;
create trigger protect_booking_trg before update on public.bookings
  for each row execute function public.protect_booking();

-- Занятость слотов: только счётчики, без данных других клиентов.
-- Вместимость слота = число дизайнеров (минимум 1).
create function public.slot_load(p_from timestamptz, p_to timestamptz)
returns table (slot_start timestamptz, taken int, capacity int, mine boolean)
language sql stable security definer set search_path = public as $$
  select b.starts_at,
         count(*)::int,
         greatest(1, (select count(*) from public.profiles where role = 'designer'))::int,
         coalesce(bool_or(b.client_id = auth.uid()), false)
  from public.bookings b
  where b.status = 'booked' and b.starts_at >= p_from and b.starts_at < p_to
  group by b.starts_at
$$;

-- Запись на слот. Время должно начинаться ровно в начале часа по UTC.
create function public.book_slot(p_start timestamptz, p_topic text, p_project uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cap int; v_taken int; v_designer uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if extract(epoch from p_start)::bigint % 3600 <> 0 then raise exception 'Некорректное время'; end if;
  if p_start < now() + interval '1 hour' then raise exception 'Это время уже недоступно'; end if;
  if p_start > now() + interval '90 days' then raise exception 'Слишком далёкая дата'; end if;
  if p_project is not null
     and not exists (select 1 from public.projects where id = p_project and client_id = auth.uid()) then
    raise exception 'Проект не найден';
  end if;

  perform pg_advisory_xact_lock(hashtext('slot:' || p_start::text));

  if exists (select 1 from public.bookings
             where client_id = auth.uid() and starts_at = p_start and status = 'booked') then
    raise exception 'Вы уже записаны на это время';
  end if;
  select greatest(1, count(*)) into v_cap from public.profiles where role = 'designer';
  select count(*) into v_taken from public.bookings where starts_at = p_start and status = 'booked';
  if v_taken >= v_cap then raise exception 'Это время уже занято'; end if;

  -- Если у клиента есть назначенный дизайнер и он свободен, записываем к нему.
  select c.designer_id into v_designer from public.conversations c
    where c.client_id = auth.uid() and c.status <> 'closed' and c.designer_id is not null
    order by c.created_at desc limit 1;
  if v_designer is not null and exists (
       select 1 from public.bookings where designer_id = v_designer and starts_at = p_start and status = 'booked') then
    v_designer := null;
  end if;

  insert into public.bookings (client_id, designer_id, project_id, starts_at, ends_at, topic)
    values (auth.uid(), v_designer, p_project, p_start, p_start + interval '1 hour', nullif(trim(coalesce(p_topic,'')), ''))
    returning id into v_id;
  return v_id;
end $$;

create function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'cancelled'
   where id = p_id and client_id = auth.uid() and status = 'booked' and starts_at > now();
  if not found then raise exception 'Эту запись нельзя отменить'; end if;
end $$;

-- ===== Права =====
revoke execute on function public.protect_lead() from public, anon, authenticated;
revoke execute on function public.protect_booking() from public, anon, authenticated;
revoke execute on function public.submit_project(uuid, text, jsonb, numeric) from public, anon;
revoke execute on function public.review_project(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.slot_load(timestamptz, timestamptz) from public, anon;
revoke execute on function public.book_slot(timestamptz, text, uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.submit_project(uuid, text, jsonb, numeric) to authenticated;
grant execute on function public.review_project(uuid, text, text, jsonb) to authenticated;
grant execute on function public.slot_load(timestamptz, timestamptz) to authenticated;
grant execute on function public.book_slot(timestamptz, text, uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Доступ к таблицам (на случай, если права по умолчанию в проекте отключены).
grant select on public.projects to authenticated;
grant select, update on public.leads to authenticated;
grant insert on public.leads to anon, authenticated;
grant select, update on public.bookings to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- ===== Обновления в реальном времени =====
alter publication supabase_realtime add table public.projects, public.leads, public.bookings;