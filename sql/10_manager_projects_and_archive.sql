-- Миграция 10: проекты для менеджера.
-- Выполнить в Supabase: SQL Editor -> New query -> Run. Можно запускать повторно.
-- Менеджер видит актуальные (не архивные) проекты и диалоги, в которых есть такой проект.
-- Менеджер не согласовывает и не возвращает проекты и не архивирует их: это делают владелец и дизайнер.

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (
    client_id = auth.uid()
    or public.my_role() = 'owner'
    or exists (select 1 from public.conversations c where c.id = conversation_id and c.designer_id = auth.uid())
    or (public.my_role() = 'manager' and archived_at is null)
  );

-- Функция читает projects с правами владельца функции, поэтому политики не зацикливаются.
create or replace function public.manager_can_see_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'manager' and exists (
    select 1 from public.projects p where p.conversation_id = p_conv and p.archived_at is null)
$$;
revoke execute on function public.manager_can_see_conversation(uuid) from public, anon;
grant execute on function public.manager_can_see_conversation(uuid) to authenticated;

-- Менеджер видит имя клиента только в диалогах, где есть его актуальный проект.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.my_role() in ('owner','designer')
    or (public.my_role() = 'manager' and role in ('owner','manager','designer'))
    or (public.my_role() = 'manager' and exists (
      select 1 from public.conversations c
      where c.client_id = profiles.id and public.manager_can_see_conversation(c.id)))
  );

drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select to authenticated
  using (
    client_id = auth.uid()
    or designer_id = auth.uid()
    or public.my_role() = 'owner'
    or public.manager_can_see_conversation(id)
  );
