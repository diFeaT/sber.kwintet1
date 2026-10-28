-- Миграция 09: архив проектов.
-- Выполнить в Supabase: SQL Editor -> New query -> Run.
-- Архивировать и возвращать из архива может назначенный дизайнер диалога или владелец.
-- Клиент видит статус «В архиве», но менять его не может.

alter table public.projects add column if not exists archived_at timestamptz;
alter table public.projects add column if not exists archived_by uuid references public.profiles(id) on delete set null;

-- Проверка прав: владелец, либо дизайнер, назначенный на диалог проекта.
create function public.can_manage_archive(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner'
    or (public.my_role() = 'designer' and exists (
      select 1 from public.projects p
      join public.conversations c on c.id = p.conversation_id
      where p.id = p_id and c.designer_id = auth.uid()))
$$;

create function public.archive_project(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if not exists (select 1 from public.projects where id = p_id) then raise exception 'Проект не найден'; end if;
  if not public.can_manage_archive(p_id) then raise exception 'Архивировать проект может назначенный дизайнер или владелец'; end if;
  update public.projects set archived_at = now(), archived_by = auth.uid() where id = p_id;
end $$;

create function public.unarchive_project(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if not exists (select 1 from public.projects where id = p_id) then raise exception 'Проект не найден'; end if;
  if not public.can_manage_archive(p_id) then raise exception 'Вернуть проект из архива может назначенный дизайнер или владелец'; end if;
  update public.projects set archived_at = null, archived_by = null where id = p_id;
end $$;

revoke execute on function public.can_manage_archive(uuid) from public, anon;
revoke execute on function public.archive_project(uuid) from public, anon;
revoke execute on function public.unarchive_project(uuid) from public, anon;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.unarchive_project(uuid) to authenticated;
