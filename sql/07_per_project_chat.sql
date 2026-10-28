-- Миграция 7: у каждого проекта свой чат без прежней истории.
-- Выполнять после 06_manager_role_lead_recipient.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- Что меняется: раньше новый проект привязывался к последней беседе клиента, и сообщения копились в одном чате.
-- Теперь submit_project для НОВОГО проекта создаёт новую беседу: в ней только сообщение об отправке этого проекта.
-- При повторной отправке уже существующего проекта чат остаётся прежним (это тот же проект).
-- Назначенный дизайнер сохраняется: новая беседа получает того же дизайнера, что у клиента был последним
-- (если он всё ещё в роли дизайнера), поэтому владельцу не нужно назначать его заново.
-- Старые проекты и их беседы не трогаются: если к одной беседе уже привязано несколько проектов, они так и остаются в ней.

create index if not exists conversations_client_idx on public.conversations (client_id, created_at desc);

create or replace function public.submit_project(p_id uuid, p_title text, p_config jsonb, p_price numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_id uuid; v_status text; v_designer uuid; v_title text := left(trim(coalesce(p_title,'')), 80);
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
    -- новый проект: новый чат
    select c.designer_id into v_designer
      from public.conversations c
      join public.profiles d on d.id = c.designer_id and d.role = 'designer'
     where c.client_id = auth.uid()
     order by c.updated_at desc limit 1;
    insert into public.conversations (client_id, designer_id)
      values (auth.uid(), v_designer) returning id into v_conv;
    insert into public.projects (client_id, conversation_id, title, config, price)
      values (auth.uid(), v_conv, v_title, p_config, coalesce(p_price,0)) returning id into v_id;
    insert into public.messages (conversation_id, body)
      values (v_conv, 'Проект «' || v_title || '» отправлен на согласование.');
  end if;
  return v_id;
end $$;