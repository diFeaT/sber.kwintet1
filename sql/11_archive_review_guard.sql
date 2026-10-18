-- Миграция 11: архивные проекты нельзя согласовать или вернуть на доработку;
-- менеджер не видит закрытые (удалённые) диалоги.
-- Выполнить в Supabase: SQL Editor -> New query -> Run. Можно запускать повторно.

create or replace function public.review_project(p_id uuid, p_decision text, p_note text, p_calc jsonb)
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
  if exists (select 1 from public.projects where id = p_id and archived_at is not null) then
    raise exception 'Проект в архиве: сначала верните его из архива';
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

-- Менеджер видит диалог только если в нём есть актуальный проект и диалог не закрыт.
create or replace function public.manager_can_see_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'manager'
    and exists (select 1 from public.conversations c where c.id = p_conv and c.status <> 'closed')
    and exists (select 1 from public.projects p where p.conversation_id = p_conv and p.archived_at is null)
$$;
