-- 預假系統 v2 — admin-controlled gate override
-- Lets an admin pin the gate open time / bookable range / round label for
-- test runs or shifted rounds. Override auto-expires once the natural
-- first-Saturday gate of the month AFTER override.gate_time arrives —
-- at that point natural monthly scheduling resumes automatically.

begin;

-- Seed empty override rows so callers can UPSERT by key.
insert into public.settings (key, value) values
  ('gate_override_time',       ''),
  ('gate_override_range_from', ''),
  ('gate_override_range_to',   ''),
  ('gate_override_round',      '')
on conflict (key) do nothing;

-- =============================================================================
-- get_gate_info() — override-aware.
-- =============================================================================

create or replace function public.get_gate_info()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_now_local        timestamp;
  v_month_1st        date;
  v_gate_date        date;
  v_gate             timestamptz;
  v_range_from       date;
  v_range_to         date;
  v_round            text;
  v_ov_time_s        text;
  v_ov_from_s        text;
  v_ov_to_s          text;
  v_ov_round_s       text;
  v_ov_gate          timestamptz;
  v_ov_month         date;
  v_ov_next_gate_dt  date;
  v_ov_expiry        timestamptz;
begin
  -- Natural (auto-computed) first-Saturday gate.
  v_now_local := now() at time zone 'Asia/Taipei';
  v_month_1st := date_trunc('month', v_now_local)::date;
  v_gate_date := public.first_saturday_of(v_month_1st);
  v_gate      := (v_gate_date + time '20:00') at time zone 'Asia/Taipei';

  if now() > v_gate then
    v_month_1st := (v_month_1st + interval '1 month')::date;
    v_gate_date := public.first_saturday_of(v_month_1st);
    v_gate      := (v_gate_date + time '20:00') at time zone 'Asia/Taipei';
  end if;

  v_range_from := v_gate_date;
  v_range_to   := (v_gate_date + interval '6 months')::date;
  v_round      := to_char(v_gate at time zone 'Asia/Taipei', 'YYYY-MM');

  -- Override lookup.
  select value into v_ov_time_s  from public.settings where key = 'gate_override_time';
  select value into v_ov_from_s  from public.settings where key = 'gate_override_range_from';
  select value into v_ov_to_s    from public.settings where key = 'gate_override_range_to';
  select value into v_ov_round_s from public.settings where key = 'gate_override_round';

  if v_ov_time_s is not null and v_ov_time_s <> '' then
    v_ov_gate := v_ov_time_s::timestamptz;

    -- Auto-expire: once first-Saturday gate of the month AFTER override's
    -- gate month has arrived, stop honoring the override.
    v_ov_month        := date_trunc('month', v_ov_gate at time zone 'Asia/Taipei')::date;
    v_ov_next_gate_dt := public.first_saturday_of((v_ov_month + interval '1 month')::date);
    v_ov_expiry       := (v_ov_next_gate_dt + time '20:00') at time zone 'Asia/Taipei';

    if now() < v_ov_expiry then
      return jsonb_build_object(
        'gate_open',     now() >= v_ov_gate,
        'gate_time',     v_ov_gate,
        'current_round', coalesce(nullif(v_ov_round_s, ''),
                                  to_char(v_ov_gate at time zone 'Asia/Taipei', 'YYYY-MM')),
        'range_from',    coalesce(nullif(v_ov_from_s, '')::date,
                                  (v_ov_gate at time zone 'Asia/Taipei')::date),
        'range_to',      coalesce(nullif(v_ov_to_s, '')::date,
                                  ((v_ov_gate at time zone 'Asia/Taipei')::date + interval '6 months')::date),
        'override',      true
      );
    end if;
  end if;

  return jsonb_build_object(
    'gate_open',     now() >= v_gate,
    'gate_time',     v_gate,
    'current_round', v_round,
    'range_from',    v_range_from,
    'range_to',      v_range_to,
    'override',      false
  );
end;
$$;

revoke all on function public.get_gate_info() from public;
grant execute on function public.get_gate_info() to authenticated;

-- =============================================================================
-- set_gate_override(p_gate_time, p_range_from, p_range_to, p_round)
-- Admin-only. UPSERTs the four override settings rows.
-- =============================================================================

create or replace function public.set_gate_override(
  p_gate_time  timestamptz,
  p_range_from date,
  p_range_to   date,
  p_round      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.settings (key, value) values
    ('gate_override_time',       p_gate_time::text),
    ('gate_override_range_from', p_range_from::text),
    ('gate_override_range_to',   p_range_to::text),
    ('gate_override_round',      coalesce(p_round, ''))
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.set_gate_override(timestamptz, date, date, text) from public;
grant execute on function public.set_gate_override(timestamptz, date, date, text) to authenticated;

-- =============================================================================
-- clear_gate_override() — admin blanks the four override rows.
-- =============================================================================

create or replace function public.clear_gate_override()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', '需要管理員權限');
  end if;

  update public.settings set value = ''
   where key in ('gate_override_time', 'gate_override_range_from',
                 'gate_override_range_to', 'gate_override_round');

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.clear_gate_override() from public;
grant execute on function public.clear_gate_override() to authenticated;

commit;
