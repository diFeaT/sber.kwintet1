-- Миграция 12: назначение дизайнеров на проекты не только владельцем.
-- Владелец и менеджер назначают любого дизайнера проекта.
-- Дизайнер видит свободные проекты (без дизайнера), берёт их в работу и может снять себя с проекта.
-- Выполнить в Supabase: SQL Editor -> New query -> Run. Можно запускать повторно.

-- Дизайнер видит свои диалоги и свободные (не закрытые) диалоги.
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select to authenticated
  using (
    client_id = auth.uid()
    or designer_id = auth.uid()
    or public.my_role() = 'owner'
    or public.manager_can_see_conversation(id)
    or (public.my_role() = 'designer' and designer_id is null and status <> 'closed')
  );

-- Дизайнер видит проекты своих диалогов и свободных диалогов.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (
    client_id = auth.uid()
    or public.my_role() = 'owner'
    or exists (select 1 from public.conversations c where c.id = conversation_id and c.designer_id = auth.uid())
    or (public.my_role() = 'designer' and exists (
      select 1 from public.conversations c
       where c.id = conversation_id and c.designer_id is null and c.status <> 'closed'))
    or (public.my_role() = 'manager' and archived_at is null)
  );

-- Менять диалоги могут владелец и менеджер (назначение), а дизайнер только свободные или свои.
drop policy if exists conv_update_owner on public.conversations;
drop policy if exists conv_update_staff on public.conversations;
create policy conv_update_staff on public.conversations for update to authenticated
  using (
    public.my_role() in ('owner','manager')
    or (public.my_role() = 'designer' and (designer_id is null or designer_id = auth.uid()))
  )
  with check (
    public.my_role() in ('owner','manager')
    or (public.my_role() = 'designer' and (designer_id is null or designer_id = auth.uid()))
  );

-- Правила назначения и закрытия. Смена клиента и статуса (закрытие чата) не открыта никому, кроме владельца.
create or replace function public.protect_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text := coalesce(public.my_role(), '');
begin
  if new.client_id <> old.client_id then raise exception 'Нельзя менять клиента'; end if;
  if auth.uid() is not null and new.status is distinct from old.status and v_role <> 'owner' then
    raise exception 'Закрыть чат может только владелец';
  end if;
  if auth.uid() is not null and new.designer_id is distinct from old.designer_id then
    if v_role in ('owner','manager') then
      if new.designer_id is not null and not exists (
        select 1 from public.profiles where id = new.designer_id and role = 'designer') then
        raise exception 'Назначить можно только дизайнера';
      end if;
    elsif v_role = 'designer' then
      if new.designer_id = auth.uid() and (old.designer_id is null or old.designer_id = auth.uid()) then
        null; -- взять свободный проект в работу
      elsif new.designer_id is null and old.designer_id = auth.uid() then
        null; -- снять себя с проекта
      else
        raise exception 'Дизайнер может взять в работу только свободный проект или снять себя';
      end if;
    else
      raise exception 'Дизайнера назначает команда';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
