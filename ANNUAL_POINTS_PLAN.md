# 年度點數 + 自動審核 — Feature Plan

Addition to v2 plan, at boss's request. Targets same May 2 launch as Phase 1.

## Business rules (locked)

- Each pharmacist has **12 points per calendar year**.
- **1 booking block = 1 point**, regardless of day count (4–7 days).
- Year is determined by the **start date** of the block.
  - Example: a booking 2026-12-28 → 2027-01-03 spends a **2026** point.
- Auto-approval: when all prerequisites pass, the booking is saved as `approved = true` in one atomic transaction. No manual approval step.
- When the current year's budget is exhausted, further bookings for that year are rejected. The pharmacist can still book dates that start in the next year (spending that year's budget).
- Budget source: single global value in `settings.annual_points_per_person = 12`. Same for everyone. Per-person overrides are Phase 2 (would add a `staff.annual_points_budget` column).

## Prerequisite checks (unchanged + new)

A booking is auto-approved iff **all** of the following pass, in order, inside one Postgres transaction:

1. Caller authenticated via Google OAuth and email linked to active staff row
2. Gate open for current round
3. Day count within [min_consecutive, max_consecutive] = [4, 7]
4. Start/end within current round's bookable range
5. **Per-user round cap:** existing days this round + new days ≤ max_per_person (14)
6. **Per-user annual points:** approved bookings in `year(start_date)` < annual_points_per_person (12) *(new)*
7. **Per-day capacity:** no date in [start, end] already has max_per_day (2) approved bookings

If any check fails → transaction rolls back, nothing inserted, user sees zh-TW error message.

## Schema delta (folded into [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql))

### `bookings` table — add two columns

| Column | Type | Notes |
|---|---|---|
| `approved` | `boolean not null default false` | Auto-set to `true` by `submit_booking`; `false` only if an admin revokes. Points only count against budget when `true`. |
| `booking_year` | `int not null generated always as (extract(year from start_date)::int) stored` | Derived from `start_date`. Indexed for fast annual lookups. Can't drift out of sync because it's generated. |

### New index

```sql
create index bookings_staff_year_approved_idx
  on public.bookings (staff_work_id, booking_year)
  where approved;
```

Partial index on `approved = true` keeps the annual-count query O(n) in the user's approved bookings only.

### `settings` — add one seed row

```sql
('annual_points_per_person', '12')
```

## RPC delta — `submit_booking`

Two additions to the critical path:

### (A) User-scoped advisory lock

Before per-day locks, acquire a per-user lock to serialize this user's submissions. Prevents double-submit races where two concurrent requests from the same pharmacist both see `used_points = 11` and both insert.

```sql
perform pg_advisory_xact_lock(hashtextextended('staff:' || v_staff.work_id, 0));
```

Lock ordering: **user-lock first, then per-day locks.** Consistent across all callers → no deadlock risk.

### (B) Annual points check

After the per-round personal cap check, before the per-day capacity check:

```sql
select count(*) into v_annual_used
  from public.bookings
 where staff_work_id = v_staff.work_id
   and booking_year  = extract(year from p_start)::int
   and approved;

if v_annual_used >= v_annual_budget then
  return jsonb_build_object(
    'success', false,
    'error', format('%s 年度點數已用完 (已使用 %s/%s)',
                    extract(year from p_start)::int,
                    v_annual_used, v_annual_budget)
  );
end if;
```

### Insert change

```sql
insert into public.bookings
  (staff_work_id, name, start_date, end_date, days, submitted_at, round, approved)
values
  (..., true);
-- booking_year is populated automatically (generated column)
```

## Frontend delta

### New hook — `src/hooks/useAnnualPoints.js`

```
useAnnualPoints(workId) → { used, budget, year, loading, refresh }
```

Single `COUNT(*)` query scoped to this user + current calendar year + `approved = true`. Refetched on mount and after every successful submit.

Current-year only for MVP. Cross-year UI (when selection spans Dec→Jan) deferred — backend error is clear enough.

### `useSettings` — add `annualPointsPerPerson`

Add to `DEFAULTS` and `KEY_MAP`.

### `MyBookings` — show annual points

Add a line above or next to the existing per-round progress:

```
年度點數  8 / 12 點  (2026)
本輪已用  4 / 14 天  [========   ]
```

### `BookingPanel` — block submit when exhausted

- If `annualPointsUsed >= annualPointsBudget`: show "✗ 年度點數已用盡 (X/12)" and disable submit button.
- Message shows the year number so it's clear during cross-year rounds.

### `BookingPage` — wire it

- Call `useAnnualPoints(staff.work_id)`
- Pass `used` / `budget` to `MyBookings` and `BookingPanel`
- Call `refresh()` after successful `submit_booking` (alongside existing `bookings.refresh()`)

## Migration strategy

Migration 0001 has not been applied anywhere yet. Fold these changes directly into `0001_init.sql` rather than creating `0002`. Keeps setup to one SQL file to paste. If 0001 were already applied somewhere, we'd create 0002 — that's not the case here.

After setup: every new feature goes in its own numbered migration, never edit a shipped one.

## Out of scope for this change

Deferred explicitly:

- Per-person budget overrides (`staff.annual_points_budget` column) — Phase 2, with admin UI
- Point refunds when admin revokes a booking — handled automatically by `approved = false` (count query filters it out), but no UI to trigger revocation yet
- Cross-year UI warnings when a selection spans Dec→Jan — backend error covers it
- Fiscal-year support — hospital may want Jul–Jun; confirm with boss before switching. Easy swap later (change the year derivation function).

## Test checklist

Add to the existing Phase 1 load-test plan:

- [ ] SQL test: seed 12 approved 2026 bookings for one staff → 13th attempt rejected with "2026 年度點數已用完"
- [ ] SQL test: same user books a 2027-start block → succeeds (different year budget)
- [ ] Concurrency: two simultaneous `submit_booking` calls from same user when used=11 — exactly one succeeds (user-lock prevents race)
- [ ] UI: `BookingPanel` disables submit and shows message when `used >= budget`
- [ ] UI: annual count in `MyBookings` updates immediately after a successful submit

## Open items — confirm with boss before launch

- **Year definition:** calendar (Jan 1 – Dec 31) vs fiscal. Plan assumes calendar.
- **Revocation policy:** if boss later revokes a booking, should the point refund automatically? Default with `approved = false` filter: yes. Confirm this matches boss's expectation.
- **Transition year:** if this ships mid-2026, does every pharmacist get a fresh 12 regardless of any GAS-era bookings? Assumption: yes — GAS history is not migrated.
