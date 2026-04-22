-- 預假系統 v2 — self-registration on first login.
-- The original register_staff (migration 0001) required an admin-pre-seeded
-- staff row and only filled in the email. This project doesn't use CSV import,
-- so that flow broke every first login with "查無此員編".
--
-- New behavior: register_staff now accepts (work_id, name). If no row exists
-- for the work_id, it creates one. If a row exists, it binds this email to it
-- (same rules as before: reject if already bound to a different email / if
-- inactive / if this email is already bound to a different work_id).
--
-- Security note: self-created rows always get is_admin=false. The existing
-- is_admin flag on pre-seeded rows is preserved.

begin;

-- Signature changed (added p_name). Drop the old one-arg version first; the
-- new version cannot coexist with it under the same name without signature
-- collision in routine calls.
drop function if exists public.register_staff(text);

create or replace function public.register_staff(
  p_work_id text,
  p_name    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_work_id text;
  v_name    text;
  v_staff   public.staff;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    return jsonb_build_object('success', false, 'error', '尚未登入');
  end if;

  v_work_id := btrim(coalesce(p_work_id, ''));
  v_name    := btrim(coalesce(p_name,    ''));

  if v_work_id = '' then
    return jsonb_build_object('success', false, 'error', '請填寫員編');
  end if;
  if v_name = '' then
    return jsonb_build_object('success', false, 'error', '請填寫姓名');
  end if;

  -- This Google account already bound to a different work_id?
  if exists (
    select 1 from public.staff
    where email = v_email and work_id <> v_work_id
  ) then
    return jsonb_build_object('success', false, 'error', '此 Google 帳號已綁定其他員編');
  end if;

  select * into v_staff from public.staff where work_id = v_work_id;

  if not found then
    -- No pre-seeded row — create one. is_admin always false on self-register.
    insert into public.staff (work_id, name, email, is_admin, active, registered_at)
    values (v_work_id, v_name, v_email, false, true, now())
    returning * into v_staff;
  else
    if not v_staff.active then
      return jsonb_build_object('success', false, 'error', '此員編已停用');
    end if;
    if v_staff.email is not null and v_staff.email <> v_email then
      return jsonb_build_object('success', false, 'error', '此員編已被其他 Google 帳號綁定');
    end if;

    -- Bind this email. Preserve existing name if already set (so an admin's
    -- pre-seeded display name isn't overwritten by whatever the user types).
    update public.staff
       set email         = v_email,
           name          = coalesce(nullif(v_staff.name, ''), v_name),
           registered_at = coalesce(v_staff.registered_at, now())
     where work_id = v_work_id
    returning * into v_staff;
  end if;

  return jsonb_build_object(
    'success', true,
    'work_id', v_staff.work_id,
    'name',    v_staff.name
  );
end;
$$;

revoke all on function public.register_staff(text, text) from public;
grant execute on function public.register_staff(text, text) to authenticated;

commit;
