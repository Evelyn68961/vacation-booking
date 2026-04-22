-- 預假系統 v2 — test mode
-- Admin-initiated temporary booking window tagged with a unique TEST-* round id.
-- Real bookings (round = 'YYYY-MM') are never touched. Ending test mode wipes
-- all rows tagged with the active test round and clears the override slots.

begin;

-- Seed empty tracker row so callers can UPSERT by key.
insert into public.settings (key, value) values
  ('test_active_round', '')
on conflict (key) do nothing;

-- =============================================================================
-- start_test_mode(p_gate_time, p_range_from, p_range_to)
--   Installs a unique TEST-YYYYMMDD-HHMI round as the active gate override
--   and records it in test_active_round. Rejects if a test is already active.
-- =============================================================================

create or replace function public.start_test_mode(
  p_gate_time  timestamptz,
  p_range_from date,
  p_range_to   date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_test text;
  v_round         text;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', '需要管理員權限');
  end if;
  if p_gate_time is null then
    return jsonb_build_object('success', false, 'error', '請指定開放時間');
  end if;
  if p_range_from is null or p_range_to is null or p_range_to < p_range_from then
    return jsonb_build_object('success', false, 'error', '預約範圍無效');
  end if;

  select value into v_existing_test from public.settings where key = 'test_active_round';
  if v_existing_test is not null and v_existing_test <> '' then
    return jsonb_build_object(
      'success', false,
      'error',   '目前已有測試模式進行中，請先結束'
    );
  end if;

  v_round := 'TEST-' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDD-HH24MI');

  insert into public.settings (key, value) values
    ('gate_override_time',       p_gate_time::text),
    ('gate_override_range_from', p_range_from::text),
    ('gate_override_range_to',   p_range_to::text),
    ('gate_override_round',      v_round),
    ('test_active_round',        v_round)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('success', true, 'round', v_round);
end;
$$;

revoke all on function public.start_test_mode(timestamptz, date, date) from public;
grant execute on function public.start_test_mode(timestamptz, date, date) to authenticated;

-- =============================================================================
-- end_test_mode() — deletes all bookings tagged with the active test round,
-- clears the override slots, empties test_active_round. Returns deleted count.
-- Real-round bookings are protected: the WHERE clause exact-matches the TEST-*
-- round id recorded in test_active_round, so 'YYYY-MM' rounds are untouched.
-- =============================================================================

create or replace function public.end_test_mode()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   text;
  v_deleted int;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', '需要管理員權限');
  end if;

  select value into v_round from public.settings where key = 'test_active_round';
  if v_round is null or v_round = '' then
    return jsonb_build_object('success', false, 'error', '目前沒有測試模式');
  end if;

  -- Belt-and-braces: only delete rounds that start with 'TEST-'. Guards against
  -- a corrupted test_active_round somehow pointing at a real round label.
  if v_round not like 'TEST-%' then
    return jsonb_build_object('success', false, 'error', '測試輪次名稱異常，未執行刪除');
  end if;

  delete from public.bookings where round = v_round;
  get diagnostics v_deleted = row_count;

  update public.settings set value = ''
   where key in ('gate_override_time', 'gate_override_range_from',
                 'gate_override_range_to', 'gate_override_round',
                 'test_active_round');

  return jsonb_build_object('success', true, 'deleted', v_deleted, 'round', v_round);
end;
$$;

revoke all on function public.end_test_mode() from public;
grant execute on function public.end_test_mode() to authenticated;

commit;
