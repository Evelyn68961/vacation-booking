-- 預假系統 v2 — fix "column reference 'd' is ambiguous" in submit_booking.
-- The original function declared a PL/pgSQL loop variable named `d` and the
-- capacity-check CTE also used `d` as a column alias. With the default
-- plpgsql.variable_conflict = error, this errors at plan time whenever the
-- CTE's column `d` is referenced. Rename the variable to v_day.

begin;

create or replace function public.submit_booking(p_start date, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arrival         timestamptz := now();
  v_email           text;
  v_staff           public.staff;
  v_max_per_day     int;
  v_max_per_person  int;
  v_min_consec      int;
  v_max_consec      int;
  v_annual_budget   int;
  v_gate            jsonb;
  v_current_round   text;
  v_range_from      date;
  v_range_to        date;
  v_days            int;
  v_year            int;
  v_existing        int;
  v_annual_used     int;
  v_blocked_dates   date[];
  v_booking         public.bookings;
  v_day             date;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    return jsonb_build_object('success', false, 'error', '尚未登入');
  end if;

  select * into v_staff from public.staff where email = v_email and active;
  if not found then
    return jsonb_build_object('success', false, 'error', '帳號未註冊或已停用');
  end if;

  select value::int into v_max_per_day    from public.settings where key = 'max_per_day';
  select value::int into v_max_per_person from public.settings where key = 'max_per_person';
  select value::int into v_min_consec     from public.settings where key = 'min_consecutive';
  select value::int into v_max_consec     from public.settings where key = 'max_consecutive';
  select value::int into v_annual_budget  from public.settings where key = 'annual_points_per_person';

  v_gate          := public.get_gate_info();
  v_current_round := v_gate->>'current_round';
  v_range_from    := (v_gate->>'range_from')::date;
  v_range_to      := (v_gate->>'range_to')::date;

  if not (v_gate->>'gate_open')::boolean then
    return jsonb_build_object('success', false, 'error', '預假尚未開放');
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    return jsonb_build_object('success', false, 'error', '日期區間無效');
  end if;

  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  if v_days < v_min_consec or v_days > v_max_consec then
    return jsonb_build_object(
      'success', false,
      'error', format('每次預假需連續 %s–%s 天', v_min_consec, v_max_consec)
    );
  end if;

  if p_start < v_range_from or p_end > v_range_to then
    return jsonb_build_object(
      'success', false,
      'error', '日期超出可預假範圍',
      'details', jsonb_build_object('range_from', v_range_from, 'range_to', v_range_to)
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff:' || v_staff.work_id, 0)
  );

  for v_day in select generate_series(p_start, p_end, '1 day')::date loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_current_round || ':' || v_day::text, 0)
    );
  end loop;

  select coalesce(sum(days), 0) into v_existing
    from public.bookings
   where staff_work_id = v_staff.work_id
     and round = v_current_round
     and approved;

  if v_existing + v_days > v_max_per_person then
    return jsonb_build_object(
      'success', false,
      'error', format('超出個人總額 %s 天', v_max_per_person),
      'details', jsonb_build_object('existing_days', v_existing, 'requested_days', v_days)
    );
  end if;

  select count(*) into v_annual_used
    from public.bookings
   where staff_work_id = v_staff.work_id
     and booking_year  = v_year
     and approved;

  if v_annual_used >= v_annual_budget then
    return jsonb_build_object(
      'success', false,
      'error', format('%s 年度點數已用完 (已使用 %s/%s)', v_year, v_annual_used, v_annual_budget),
      'details', jsonb_build_object(
        'year', v_year,
        'used', v_annual_used,
        'budget', v_annual_budget
      )
    );
  end if;

  with overlap_rows as (
    select start_date, end_date
      from public.bookings
     where round = v_current_round
       and approved
       and daterange(start_date, end_date, '[]')
           && daterange(p_start, p_end, '[]')
  ),
  expanded as (
    select generate_series(
             greatest(start_date, p_start),
             least(end_date, p_end),
             '1 day'::interval
           )::date as d
      from overlap_rows
  ),
  counts as (
    select d, count(*)::int as n
      from expanded
     group by d
  )
  select array_agg(d order by d) into v_blocked_dates
    from counts
   where n >= v_max_per_day;

  if v_blocked_dates is not null and array_length(v_blocked_dates, 1) > 0 then
    return jsonb_build_object(
      'success', false,
      'error', '以下日期已額滿',
      'details', jsonb_build_object('blocked_dates', v_blocked_dates)
    );
  end if;

  insert into public.bookings
    (staff_work_id, name, start_date, end_date, days, submitted_at, round, approved)
  values
    (v_staff.work_id, v_staff.name, p_start, p_end, v_days, v_arrival, v_current_round, true)
  returning * into v_booking;

  return jsonb_build_object(
    'success', true,
    'booking', to_jsonb(v_booking)
  );
end;
$$;

revoke all on function public.submit_booking(date, date) from public;
grant execute on function public.submit_booking(date, date) to authenticated;

commit;
