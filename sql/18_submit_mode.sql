-- Миграция 18: переключатель способа отправки проекта дизайнеру (только владелец).
-- Выполнять после 17_promo_delete.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- submit_mode = 'account' — стандартно: отправка только после регистрации/входа;
-- submit_mode = 'guest'   — отправка без регистрации: имя и телефон, проект уходит как обращение дизайнеру.

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings (key, value) values ('submit_mode', 'account')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- читать настройку могут все (гостю нужно знать режим); писать — только через функцию владельца
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

create or replace function public.set_submit_mode(p_mode text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  if p_mode not in ('account', 'guest') then raise exception 'Неизвестный режим'; end if;
  insert into public.app_settings (key, value) values ('submit_mode', p_mode)
  on conflict (key) do update set value = excluded.value;
end $$;

revoke execute on function public.set_submit_mode(text) from public, anon;
grant execute on function public.set_submit_mode(text) to authenticated;
