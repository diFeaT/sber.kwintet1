-- Миграция 14: один бесплатный пробный проект для клиента.
-- Выполнять после 13_creative_role_ready_homes.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- Что меняется:
-- - таблица client_quota считает, сколько НОВЫХ проектов создал клиент (удаление проекта счётчик не уменьшает);
-- - клиент не может читать и менять таблицу напрямую: её трогает только функция submit_project;
-- - submit_project для клиента при втором новом проекте выдаёт ошибку. Повторная отправка уже существующего проекта разрешена.
-- - сотрудники (дизайнер, владелец) лимитом не ограничены.

create table if not exists public.client_quota (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  projects_created int not null default 0
);

alter table public.client_quota enable row level security;
-- политик для authenticated нет: доступа у клиента к таблице нет совсем
revoke all on public.client_quota from anon, authenticated;

-- клиенты, у которых проекты уже есть, считаются использовавшими пробный проект
insert into public.client_quota (client_id, projects_created)
  select client_id, count(*) from public.projects group by client_id
  on conflict (client_id) do nothing;

create or replace function public.submit_project(p_id uuid, p_title text, p_config jsonb, p_price numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_conv uuid; v_id uuid; v_status text; v_designer uuid; v_title text := left(trim(coalesce(p_title,'')), 80);
        v_role text; v_used int;
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
    -- новый проект: сначала проверяем пробный лимит клиента
    select role into v_role from public.profiles where id = auth.uid();
    if coalesce(v_role, 'client') = 'client' then
      insert into public.client_quota (client_id, projects_created) values (auth.uid(), 0)
        on conflict (client_id) do nothing;
      select projects_created into v_used from public.client_quota where client_id = auth.uid() for update;
      if v_used >= 1 then
        raise exception 'Бесплатный пробный проект уже использован. Для новых проектов понадобится подписка.';
      end if;
      update public.client_quota set projects_created = projects_created + 1 where client_id = auth.uid();
    end if;

    -- новый чат
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

revoke execute on function public.submit_project(uuid, text, jsonb, numeric) from public, anon;
grant execute on function public.submit_project(uuid, text, jsonb, numeric) to authenticated;
