-- Миграция 5: поле «Тема обращения» в форме внизу главной страницы.
-- Выполнять после 04_phone_auth.sql, целиком, в SQL Editor. Файл можно запускать повторно.

alter table public.leads add column if not exists topic text;
alter table public.leads drop constraint if exists leads_topic_len;
alter table public.leads add constraint leads_topic_len check (topic is null or char_length(topic) <= 200);

-- Менеджеры по-прежнему могут менять только статус обращения: тема тоже защищена от правок.
create or replace function public.protect_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.name <> old.name or new.phone <> old.phone or new.user_id is distinct from old.user_id
     or new.created_at <> old.created_at or new.topic is distinct from old.topic then
    raise exception 'Менять можно только статус';
  end if;
  if new.taken_by is distinct from old.taken_by and new.taken_by is not null
     and new.taken_by <> auth.uid() and coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'Взять в работу можно только на себя';
  end if;
  return new;
end $$;