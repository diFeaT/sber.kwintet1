-- Миграция 3: удаление проекта клиентом.
-- Выполнять после 02_projects_slots_leads.sql. Файл можно запускать повторно.

create or replace function public.delete_project(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_title text; v_status text;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  select conversation_id, title, status into v_conv, v_title, v_status
    from public.projects where id = p_id and client_id = auth.uid();
  if not found then raise exception 'Проект не найден'; end if;
  if v_status = 'paid' then raise exception 'Оплаченный проект удалить нельзя'; end if;
  delete from public.projects where id = p_id;   -- записи на консультацию остаются, связь с проектом снимается
  insert into public.messages (conversation_id, body)
    values (v_conv, 'Клиент удалил проект «' || v_title || '».');
end $$;

revoke execute on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;