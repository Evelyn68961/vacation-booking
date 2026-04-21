-- 預假系統 v2 — initial schema
-- Tables, indexes, RLS, and RPCs for gate-based vacation booking.
-- All time math anchored to Asia/Taipei. Error strings in zh-TW.

begin;

-- =============================================================================
-- Tables
-- =============================================================================

create table if not exists public.staff (
  work_id       text primary key,
  name          text not null,
  email         text unique,
  is_admin      boolean not null default false,
  active        boolean not null default true,
  registered_at timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.bookings (
  id            bigserial primary key,
  staff_work_id text not null references public.staff(work_id),
  name          text not null,
  start_date    date not null,
  end_date      date not null,
  days          int  not null,
  submitted_at  timestamptz not null,
  round         text not null,
  approved      boolean not null default false,
  booking_year  int not null generated always as (extract(year from start_date)::int) stored,
  check (end_date >= start_date),
  check (days = (end_date - start_date + 1))
);

create index if not exists bookings_round_idx
  on public.bookings (round);

create index if not exists bookings_staff_round_idx
  on public.bookings (staff_work_id, round);

create index if not exists bookings_daterange_gist
  on public.bookings
  using gist (daterange(start_date, end_date, '[]'));

-- Partial index for the annual-points lookup in submit_booking.
create index if not exists bookings_staff_year_approved_idx
  on public.bookings (staff_work_id, booking_year)
  where approved;

create table if not exists public.settings (
  key   text primary key,
  value text not null
);

insert into public.settings (key, value) values
  ('max_per_day',              '2'),
  ('max_per_person',          '14'),
  ('min_consecutive',          '4'),
  ('max_consecutive',          '7'),
  ('annual_points_per_person','12')
on conflict (key) do nothing;

create table if not exists public.rounds (
  round_id   text primary key,
  gate_time  timestamptz not null,
  range_from date not null,
  range_to   date not null,
  closed_at  timestamptz
);

-- =============================================================================
-- is_admin() — SECURITY DEFINER, reads JWT internally.
-- Avoids RLS recursion from policies doing EXISTS(SELECT FROM staff).
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select s.is_admin
       from public.staff s
      where s.email = (auth.jwt() ->> 'email')
        and s.active),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- =============================================================================
-- first_saturday_of(month_1st) — extracted for unit testing.
-- dow: 0=Sun..6=Sat. Offset = (6 - dow + 7) % 7 days to reach Saturday.
--   If month_1st is Sat (dow=6): offset 0 → same day (correct).
--   If month_1st is Sun (dow=0): offset 6 → next Saturday (correct).
-- =============================================================================

create or replace function public.first_saturday_of(p_month_1st date)
returns date
language sql
immutable
as $$
  select p_month_1st + ((6 - extract(dow from p_month_1st)::int + 7) % 7);
$$;

-- =============================================================================
-- get_gate_info() — Asia/Taipei anchored gate math.
-- Returns: gate_open, gate_time, current_round, range_from, range_to.
-- =============================================================================

create or replace function public.get_gate_info()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_now_local   timestamp;   -- Taipei wall clock (no TZ)
  v_month_1st   date;
  v_gate_date   date;
  v_gate        timestamptz;
  v_range_from  date;
  v_range_to    date;
  v_round       text;
begin
  v_now_local := now() at time zone 'Asia/Taipei';
  v_month_1st := date_trunc('month', v_now_local)::date;
  v_gate_date := public.first_saturday_of(v_month_1st);
  v_gate      := (v_gate_date + time '20:00') at time zone 'Asia/Taipei';

  -- If this month's gate has already passed, roll to next month's first Saturday.
  if now() > v_gate then
    v_month_1st := (v_month_1st + interval '1 month')::date;
    v_gate_date := public.first_saturday_of(v_month_1st);
    v_gate      := (v_gate_date + time '20:00') at time zone 'Asia/Taipei';
  end if;

  v_range_from := v_gate_date;
  v_range_to   := (v_gate_date + interval '6 months')::date;
  v_round      := to_char(v_gate at time zone 'Asia/Taipei', 'YYYY-MM');

  return jsonb_build_object(
    'gate_open',      now() >= v_gate,
    'gate_time',      v_gate,
    'current_round',  v_round,
    'range_from',     v_range_from,
    'range_to',       v_range_to
  );
end;
$$;

revoke all on function public.get_gate_info() from public;
grant execute on function public.get_gate_info() to authenticated;

-- =============================================================================
-- register_staff(p_work_id) — link Google email to pre-registered work ID.
-- =============================================================================

create or replace function public.register_staff(p_work_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_staff public.staff;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    return jsonb_build_object('success', false, 'error', '尚未登入');
  end if;

  -- Email already linked to a different work ID?
  if exists (
    select 1 from public.staff
    where email = v_email and work_id <> p_work_id
  ) then
    return jsonb_build_object('success', false, 'error', '此 Google 帳號已綁定其他員編');
  end if;

  select * into v_staff from public.staff where work_id = p_work_id;
  if not found then
    return jsonb_build_object('success', false, 'error', '查無此員編');
  end if;
  if not v_staff.active then
    return jsonb_build_object('success', false, 'error', '此員編已停用');
  end if;
  if v_staff.email is not null and v_staff.email <> v_email then
    return jsonb_build_object('success', false, 'error', '此員編已被其他 Google 帳號綁定');
  end if;

  update public.staff
     set email = v_email,
         registered_at = coalesce(registered_at, now())
   where work_id = p_work_id;

  return jsonb_build_object(
    'success', true,
    'work_id', v_staff.work_id,
    'name',    v_staff.name
  );
end;
$$;

revoke all on function public.register_staff(text) from public;
grant execute on function public.register_staff(text) to authenticated;

-- =============================================================================
-- submit_booking(p_start, p_end) — critical path.
-- Single transaction: validate → per-day advisory lock → capacity check → insert.
-- =============================================================================

create or replace function public.submit_booking(p_start date, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arrival         timestamptz := now();   -- captured pre-lock for display/sort
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
  d                 date;
begin
  -- 1. Identify caller.
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    return jsonb_build_object('success', false, 'error', '尚未登入');
  end if;

  select * into v_staff from public.staff where email = v_email and active;
  if not found then
    return jsonb_build_object('success', false, 'error', '帳號未註冊或已停用');
  end if;

  -- 2. Load settings.
  select value::int into v_max_per_day    from public.settings where key = 'max_per_day';
  select value::int into v_max_per_person from public.settings where key = 'max_per_person';
  select value::int into v_min_consec     from public.settings where key = 'min_consecutive';
  select value::int into v_max_consec     from public.settings where key = 'max_consecutive';
  select value::int into v_annual_budget  from public.settings where key = 'annual_points_per_person';

  -- 3. Gate info.
  v_gate          := public.get_gate_info();
  v_current_round := v_gate->>'current_round';
  v_range_from    := (v_gate->>'range_from')::date;
  v_range_to      := (v_gate->>'range_to')::date;

  if not (v_gate->>'gate_open')::boolean then
    return jsonb_build_object('success', false, 'error', '預假尚未開放');
  end if;

  -- 4. Fail-fast validation (no lock yet).
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

  -- 5a. User-scoped advisory lock — serializes this user's concurrent submits.
  -- Acquired BEFORE per-day locks so lock ordering is consistent: user, then days.
  perform pg_advisory_xact_lock(
    hashtextextended('staff:' || v_staff.work_id, 0)
  );

  -- 5b. Per-day advisory locks (released at COMMIT/ROLLBACK).
  -- Scoped to (round, date) — only conflicts with submissions touching same day(s).
  for d in select generate_series(p_start, p_end, '1 day')::date loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_current_round || ':' || d::text, 0)
    );
  end loop;

  -- 6a. Personal cap check (inside lock). Revoked bookings don't count.
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

  -- 6b. Annual points check — count approved bookings in the start_date's year.
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

  -- 6c. Per-day capacity check via GIST range overlap.
  with overlaps as (
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
      from overlaps
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

  -- 7. Insert — auto-approved. booking_year is the generated column (derived from start_date).
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

-- =============================================================================
-- get_calendar_data() — aggregate per-date booking counts for current round.
-- Returns array of {date, count, names} for UI rendering.
-- =============================================================================

create or replace function public.get_calendar_data()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_gate          jsonb;
  v_current_round text;
  v_result        jsonb;
begin
  v_gate          := public.get_gate_info();
  v_current_round := v_gate->>'current_round';

  with expanded as (
    select generate_series(start_date, end_date, '1 day'::interval)::date as d,
           name
      from public.bookings
     where round = v_current_round
       and approved
  )
  select coalesce(jsonb_agg(row), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
               'date',  d,
               'count', count(*),
               'names', array_agg(name order by name)
             ) as row
        from expanded
       group by d
       order by d
    ) t;

  return jsonb_build_object(
    'round', v_current_round,
    'days',  v_result
  );
end;
$$;

revoke all on function public.get_calendar_data() from public;
grant execute on function public.get_calendar_data() to authenticated;

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table public.staff    enable row level security;
alter table public.bookings enable row level security;
alter table public.settings enable row level security;
alter table public.rounds   enable row level security;

-- staff: authenticated reads; writes via admin RPC only (no direct INSERT/UPDATE).
create policy staff_select_authenticated on public.staff
  for select to authenticated using (true);

-- bookings: authenticated reads; writes only via submit_booking (SECURITY DEFINER).
create policy bookings_select_authenticated on public.bookings
  for select to authenticated using (true);

-- settings: authenticated reads; writes via admin RPC only.
create policy settings_select_authenticated on public.settings
  for select to authenticated using (true);

-- rounds: authenticated reads.
create policy rounds_select_authenticated on public.rounds
  for select to authenticated using (true);

-- No INSERT/UPDATE/DELETE policies → all writes must go through SECURITY DEFINER RPCs.

commit;