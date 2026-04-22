-- 預假系統 v2 — extend range_to to the next Sunday on/after gate_date + 6 months.
-- Example: gate 2026-05-02 (Sat) → range_to = 2026-11-08 (Sun), not 2026-11-02.
-- Applies to both the natural first-Saturday gate and the override branch's
-- fallback when the admin did not supply an explicit range_to.

begin;

-- Helper: next Sunday on or after p_date. Sunday = dow 0.
-- If p_date itself is Sunday, returns p_date unchanged.
create or replace function public.next_sunday_on_or_after(p_date date)
returns date
language sql
immutable
as $$
  select p_date + ((7 - extract(dow from p_date)::int) % 7);
$$;

-- =============================================================================
-- get_gate_info() — range_to now snaps forward to the next Sunday.
-- Natural branch + override-fallback branch both use next_sunday_on_or_after.
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
  v_range_to   := public.next_sunday_on_or_after(
                    (v_gate_date + interval '6 months')::date
                  );
  v_round      := to_char(v_gate at time zone 'Asia/Taipei', 'YYYY-MM');

  -- Override lookup.
  select value into v_ov_time_s  from public.settings where key = 'gate_override_time';
  select value into v_ov_from_s  from public.settings where key = 'gate_override_range_from';
  select value into v_ov_to_s    from public.settings where key = 'gate_override_range_to';
  select value into v_ov_round_s from public.settings where key = 'gate_override_round';

  if v_ov_time_s is not null and v_ov_time_s <> '' then
    v_ov_gate := v_ov_time_s::timestamptz;

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
        'range_to',      coalesce(
                           nullif(v_ov_to_s, '')::date,
                           public.next_sunday_on_or_after(
                             ((v_ov_gate at time zone 'Asia/Taipei')::date + interval '6 months')::date
                           )
                         ),
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

commit;
