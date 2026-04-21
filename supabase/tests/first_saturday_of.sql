-- Tests for first_saturday_of() — run in Supabase SQL Editor after migration.
-- Covers all 7 possible values of extract(dow from month_1st).
-- Expected output: 7 rows, all pass = true.

with cases as (
  select *
  from (values
    -- (month_1st, expected_first_saturday, dow_of_1st, description)
    ('2026-02-01'::date, '2026-02-07'::date, 0, '1st is Sunday'),
    ('2026-06-01'::date, '2026-06-06'::date, 1, '1st is Monday'),
    ('2026-09-01'::date, '2026-09-05'::date, 2, '1st is Tuesday'),
    ('2026-04-01'::date, '2026-04-04'::date, 3, '1st is Wednesday'),
    ('2026-01-01'::date, '2026-01-03'::date, 4, '1st is Thursday'),
    ('2026-05-01'::date, '2026-05-02'::date, 5, '1st is Friday — edge: May 2026 (launch round)'),
    ('2026-08-01'::date, '2026-08-01'::date, 6, '1st is Saturday — edge: offset 0')
  ) as t(month_1st, expected, expected_dow, description)
)
select
  description,
  month_1st,
  expected_dow                                 as expected_dow,
  extract(dow from month_1st)::int             as actual_dow,
  expected                                     as expected_saturday,
  public.first_saturday_of(month_1st)          as actual_saturday,
  (public.first_saturday_of(month_1st) = expected
    and extract(dow from month_1st)::int = expected_dow
    and extract(dow from public.first_saturday_of(month_1st))::int = 6)
    as pass
from cases
order by expected_dow;

-- Integration check: gate_info sanity for May 2026 launch.
-- Expected current_round = '2026-05', range_from = '2026-05-02', range_to = '2026-11-02'
-- (assuming now() is between 2026-04-05 20:00 Taipei and 2026-05-02 20:00 Taipei).
select public.get_gate_info();
