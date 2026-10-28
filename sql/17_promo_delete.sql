-- Миграция 17: удаление промокода владельцем.
-- Выполнять после 16_promo_admin.sql, целиком, в SQL Editor. Можно запускать повторно.
--
-- Удаляет промокод вместе с его историей использования (связь каскадная).
-- Если нужно сохранить историю, промокод лучше выключить (promo_set_active), а не удалять.

create or replace function public.promo_delete(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'owner' then raise exception 'Только владелец'; end if;
  delete from public.promo_codes where code = upper(trim(coalesce(p_code,'')));
  if not found then raise exception 'Промокод не найден'; end if;
end $$;

revoke execute on function public.promo_delete(text) from public, anon;
grant execute on function public.promo_delete(text) to authenticated;
