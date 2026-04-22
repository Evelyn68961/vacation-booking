# Vacation Booking System — Specification

Derived from source code in this repository. Reflects actual behavior of the
implementation, not the aspirational plan. Cross-references into the code use
clickable links.

---

## 1. Purpose

A pharmacist vacation pre-booking web app with a scheduled monthly "gate" that
opens bookings for the next six-month window. Booking is first-come, first-served
against per-day capacity and per-person quotas, with server-authoritative
time and capacity checks.

- **Primary surface:** mobile-first PWA in Traditional Chinese (`zh-TW`, `Asia/Taipei`).
- **Auth:** Google OAuth via Supabase.
- **Persistence + realtime:** Supabase Postgres (RLS + `SECURITY DEFINER` RPCs + Realtime).
- **Hosting:** Vercel (auto-deploy on push to `main`, per [README.md](README.md)).

---

## 2. Stack and layout

| Area | Tech |
|---|---|
| Frontend | Vite + React 18, React Router 6, `@supabase/supabase-js` |
| PWA | [`vite-plugin-pwa`](vite.config.js) with `autoUpdate` |
| Backend | Supabase Postgres — schema in [supabase/migrations/](supabase/migrations/), applied in numeric order |
| Styling | Hand-rolled CSS tokens in [src/index.css](src/index.css) |
| Fonts | Noto Sans TC from Google Fonts, wired in [index.html](index.html) |

Entry points: [index.html](index.html) → [src/main.jsx](src/main.jsx) → [src/App.jsx](src/App.jsx).

### Migrations

Applied in order; each is a standalone transaction.

| File | Purpose |
|---|---|
| [0001_init.sql](supabase/migrations/0001_init.sql) | Tables, indexes, RLS, core RPCs (`get_gate_info`, `submit_booking`, `register_staff`, `get_calendar_data`, `is_admin`, `first_saturday_of`). |
| [0002_gate_override.sql](supabase/migrations/0002_gate_override.sql) | Admin-controlled gate override — override-aware `get_gate_info`, plus `set_gate_override`/`clear_gate_override` RPCs. |
| [0003_extend_range_to_sunday.sql](supabase/migrations/0003_extend_range_to_sunday.sql) | `range_to` snaps forward to the next Sunday on/after `gate_date + 6 months`. Adds `next_sunday_on_or_after` helper. |
| [0004_test_mode.sql](supabase/migrations/0004_test_mode.sql) | `start_test_mode`/`end_test_mode` RPCs and `test_active_round` tracker. Test bookings carry a `TEST-YYYYMMDD-HHMI` round tag; ending test mode exact-matches that tag and deletes only test rows. |
| [0005_fix_submit_booking_variable_conflict.sql](supabase/migrations/0005_fix_submit_booking_variable_conflict.sql) | Bug fix — renames PL/pgSQL loop variable `d` → `v_day` in `submit_booking` to resolve "column reference 'd' is ambiguous" against the CTE column `d` (PL/pgSQL default `variable_conflict = error`). |
| [0006_max_consecutive_10.sql](supabase/migrations/0006_max_consecutive_10.sql) | Raises `max_consecutive` from 7 → 10 in `settings`. No function change — `submit_booking` reads from `settings` at call time. |

Environment variables (see [.env.example](.env.example)):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Both are required at boot — [src/lib/supabase.js:6-8](src/lib/supabase.js#L6-L8) throws on startup if either is missing.

---

## 3. Domain model

### 3.1 Tables

Defined in [supabase/migrations/0001_init.sql:11-70](supabase/migrations/0001_init.sql#L11-L70).

#### `staff`
| Column | Type | Notes |
|---|---|---|
| `work_id` | `text PK` | Employee ID (e.g. `P12345`). Pre-seeded by admin (CSV import, see [staff_template.csv](staff_template.csv)). |
| `name` | `text` | Display name. |
| `email` | `text UNIQUE` | Google email, set on first registration. `NULL` until registered. |
| `is_admin` | `boolean` | Default `false`. |
| `active` | `boolean` | Default `true`. Inactive rows are treated as unregistered. |
| `registered_at` | `timestamptz` | Set once by `register_staff`. |
| `created_at` | `timestamptz` | Defaults to `now()`. |

#### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `staff_work_id` | `text FK → staff.work_id` | |
| `name` | `text` | Copied from `staff` at submit time. |
| `start_date` / `end_date` | `date` | Inclusive. `end_date >= start_date` enforced by CHECK. |
| `days` | `int` | Enforced `= end_date - start_date + 1`. |
| `submitted_at` | `timestamptz` | Captured **pre-lock** in [`submit_booking`](supabase/migrations/0001_init.sql#L226) (`v_arrival := now()`), so it represents arrival order, not commit order. |
| `round` | `text` | Round label `YYYY-MM`, e.g. `2026-05`. |
| `approved` | `boolean` | Auto-`true` on insert — there is no approval flow in code. Future revoke/void would flip this to `false`. |
| `booking_year` | `int` GENERATED from `EXTRACT(YEAR FROM start_date)` | Drives the annual-points check. |

Indexes: `(round)`, `(staff_work_id, round)`, GIST on `daterange(start_date, end_date, '[]')`, and a partial `(staff_work_id, booking_year) WHERE approved`.

#### `settings`
Key/value text table, seeded at migration time:

| Key | Value | Introduced |
|---|---|---|
| `max_per_day` | `2` | 0001 |
| `max_per_person` | `14` | 0001 |
| `min_consecutive` | `4` | 0001 |
| `max_consecutive` | `10` (raised from seed default `7` by migration 0006) | 0001 / 0006 |
| `annual_points_per_person` | `12` | 0001 |
| `gate_override_time` | `''` (empty = inactive) | 0002 |
| `gate_override_range_from` | `''` | 0002 |
| `gate_override_range_to` | `''` | 0002 |
| `gate_override_round` | `''` | 0002 |
| `test_active_round` | `''` (empty = no test running) | 0004 |

Keys other than the first five are managed by `SECURITY DEFINER` admin RPCs (`set_gate_override`, `clear_gate_override`, `start_test_mode`, `end_test_mode`) — never written directly.

#### `rounds`
`(round_id, gate_time, range_from, range_to, closed_at)` — table exists but no
code reads or writes it today. Reserved for future admin/history tooling.

### 3.2 Row-level security

Every public table is RLS-enabled. Policies in [supabase/migrations/0001_init.sql:449-470](supabase/migrations/0001_init.sql#L449-L470) grant `SELECT` to `authenticated` only; there are **no** `INSERT`/`UPDATE`/`DELETE` policies. All writes must go through `SECURITY DEFINER` RPCs.

`public.is_admin()` is a `SECURITY DEFINER` helper that reads `auth.jwt() ->> 'email'`; defined this way to avoid RLS recursion when a policy would otherwise `SELECT` from `staff`. Not used by any policy today, but gates every admin RPC introduced in 0002 and 0004 (`set_gate_override`, `clear_gate_override`, `start_test_mode`, `end_test_mode`).

---

## 4. Gate logic

Live implementation after migration 0002 lives in [supabase/migrations/0002_gate_override.sql](supabase/migrations/0002_gate_override.sql) and is further adjusted by [0003_extend_range_to_sunday.sql](supabase/migrations/0003_extend_range_to_sunday.sql). The function has two branches: a natural first-Saturday computation, and an admin-override short-circuit that takes priority while a set-and-unexpired override is present.

### 4.1 Natural branch

- **Gate time:** 20:00 `Asia/Taipei` on the **first Saturday** of the current month.
- **Computation** ([`first_saturday_of`](supabase/migrations/0001_init.sql#L103-L109)):
  `month_1st + ((6 - dow(month_1st) + 7) % 7)` days. Covered by all 7 dow cases in [supabase/tests/first_saturday_of.sql](supabase/tests/first_saturday_of.sql).
- **Rollover:** if the current month's gate has already passed, the function advances to next month's first Saturday.
- **Bookable window** (returned as `range_from`/`range_to`):
  - `range_from` = the gate date itself.
  - `range_to` = next Sunday on or after `gate_date + 6 months`, via [`public.next_sunday_on_or_after(date)`](supabase/migrations/0003_extend_range_to_sunday.sql) (migration 0003). Example: gate `2026-05-02` → `range_to = 2026-11-08`.
- **Round label:** `to_char(v_gate at time zone 'Asia/Taipei', 'YYYY-MM')` — e.g. `2026-05`.

### 4.2 Override branch

If `settings.gate_override_time` is non-empty, `get_gate_info()` uses the override's values instead — **unless** the override has auto-expired. Auto-expiry is computed from the override's own gate month: expiry = 20:00 on the first Saturday of the month *after* `gate_override_time`. Once `now() >= expiry`, the override rows are ignored and the natural branch runs. Rows are not physically deleted on expiry — they just stop being honored, and the admin page surfaces a banner prompting cleanup.

When the override branch wins, fallback defaults are computed per missing field:
- `range_from` defaults to the override's gate date.
- `range_to` defaults to next Sunday on/after `gate_date + 6 months` (same helper as the natural branch).
- `current_round` defaults to `YYYY-MM` of the override's gate time.

### 4.3 Returned shape

```json
{ "gate_open":     true,
  "gate_time":     "2026-05-02T12:00:00Z",
  "current_round": "2026-05",
  "range_from":    "2026-05-02",
  "range_to":      "2026-11-08",
  "override":      false }
```

`override` is a new boolean added by 0002 to let the client distinguish natural vs. overridden rounds (used by the admin page; unused by the booking page today).

### 4.4 Client refetch

Client polls this RPC once a minute via [`useGateInfo`](src/hooks/useGateInfo.js) so a sitting page flips from "closed" to "open" at the computed gate time without a manual refresh. The second-level countdown in [`StatusBar`](src/components/StatusBar.jsx) is purely display (client clock), while authoritative open/closed comes from the server on each refetch.

---

## 5. Auth, routes, and registration flow

Handled in [`useAuth`](src/hooks/useAuth.js) and routed by [`App`](src/App.jsx).

1. **No session** → render [`LoginButton`](src/components/LoginButton.jsx) → `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin })`.
2. **Session exists, staff row not found** for the email → render [`RegisterPage`](src/pages/RegisterPage.jsx). User types their `work_id`, which calls [`register_staff(p_work_id)`](supabase/migrations/0001_init.sql#L164-L209).
3. **Registered and active** → React Router renders one of:
   - `/` → [`BookingPage`](src/pages/BookingPage.jsx)
   - `/help` → [`HelpPage`](src/pages/HelpPage.jsx) (static usage guide, zh-TW)
   - `/records` → [`RecordsPage`](src/pages/RecordsPage.jsx) (full history browser, all users)
   - `/admin` → [`AdminPage`](src/pages/AdminPage.jsx), gated on `staff.is_admin` (redirects to `/` if not admin)
   - any other path → redirects to `/`
4. [`StatusBar`](src/components/StatusBar.jsx) surfaces `說明` / `紀錄` links for everyone, plus `管理` for admins, plus `登出`. Route-level guards are in `App.jsx`, not the buttons.

### `register_staff` rules ([migration L164-L209](supabase/migrations/0001_init.sql#L164-L209))

- Must be logged in (`auth.jwt() ->> 'email'` non-null) — else `尚未登入`.
- If the caller's email is already bound to a **different** `work_id` → `此 Google 帳號已綁定其他員編`.
- If `work_id` not found → `查無此員編`.
- If `work_id` is inactive → `此員編已停用`.
- If `work_id` already has a different email bound → `此員編已被其他 Google 帳號綁定`.
- Otherwise: set `email = caller email` and set `registered_at` if not set. Returns `{success:true, work_id, name}`.

Sign-out clears the local `staff` state immediately ([`useAuth.js:68-71`](src/hooks/useAuth.js#L68-L71)).

---

## 6. Booking flow (client)

[`BookingPage`](src/pages/BookingPage.jsx) composes:

- [`StatusBar`](src/components/StatusBar.jsx) — round, open/closed chip, countdown, range, route links, sign-out.
- [`CalendarGrid`](src/components/CalendarGrid.jsx) + 7× [`MiniCalendar`](src/components/MiniCalendar.jsx) — the 7 months starting at `range_from`'s month.
- [`BookingPanel`](src/components/BookingPanel.jsx) — form, validation, submit button.
- [`MyBookings`](src/components/MyBookings.jsx) — annual-points bar, round-days bar, list of own rows.
- [`PublicLog`](src/components/PublicLog.jsx) — full log of the current round with submit timestamps in Taipei time. Responsive: table on ≥ 640px, stacked cards on mobile (see §13).
- [`ConfirmDialog`](src/components/ConfirmDialog.jsx) — mandatory confirmation modal (no-cancel warning).

### 6.0 Closed-state overlay

When `gate_open` is `false`, [`BookingPage`](src/pages/BookingPage.jsx) renders a semi-transparent overlay (rgba white, 0.55 alpha + 1px backdrop blur) covering the calendar grid + booking panel + MyBookings. The overlay blocks pointer events and centers a small card with 🔒 lock icon, "預約尚未開放", and the upcoming gate time. `StatusBar` (with the live countdown) and `PublicLog` sit outside the overlay and remain readable/interactive.

### 6.1 Date selection

Two-click range selection ([BookingPage.jsx:58-78](src/pages/BookingPage.jsx#L58-L78)):

1. First click sets `selStart`.
2. Second click: if earlier → becomes new start; if same day → clears; if later → sets `selEnd`.

Selection is reflected via a `Set<YYYY-MM-DD>` passed to each mini-calendar, which styles range-start / -mid / -end cells ([MiniCalendar.jsx:55-63](src/components/MiniCalendar.jsx#L55-L63)).

### 6.2 Calendar cell states ([MiniCalendar.jsx:48-64](src/components/MiniCalendar.jsx#L48-L64))

| State | Condition | Styling class |
|---|---|---|
| Disabled | outside `range_from..range_to` | `cal-disabled` |
| Available | `count < maxPerDay - 1` | `cal-available` (green) |
| Half-full | `count === maxPerDay - 1` | `cal-half` (amber) |
| Full | `count >= maxPerDay` | `cal-full` (red, not clickable) |
| Selected | in `selectedDates` | overlay `cal-selected` |

A small badge in the top-right shows the current count when `> 0`.

### 6.3 Client-side validation ([BookingPanel.jsx:20-39](src/components/BookingPanel.jsx#L20-L39))

Submit is enabled only when **all** of:

- Gate open
- A full range (`selStart && selEnd`) is chosen
- `selDays` is within `[minConsecutive, maxConsecutive]`
- `personUsed + selDays <= maxPerPerson` (round cap)
- No day in the selection is already at capacity (`countByDate[d] < maxPerDay`)
- Annual points not exhausted (`annualUsed < annualBudget`)
- Not currently submitting

These mirror — but do **not** replace — the authoritative checks in [`submit_booking`](supabase/migrations/0001_init.sql#L219-L391).

### 6.4 Submit

1. User clicks 送出預約 → [`ConfirmDialog`](src/components/ConfirmDialog.jsx) opens with "送出後無法取消" warning.
2. Confirm → `supabase.rpc('submit_booking', { p_start, p_end })` ([BookingPage.jsx:80-107](src/pages/BookingPage.jsx#L80-L107)).
3. On `{success:true}`: success toast, clear selection, nudge `refresh()` on both bookings and annual points.
4. On `{success:false}`: error toast with server `error` plus any `details.blocked_dates`.
5. Toasts auto-dismiss after 4000 ms.

---

## 7. `submit_booking` — server-authoritative core

The live definition lives in [migration 0005](supabase/migrations/0005_fix_submit_booking_variable_conflict.sql) (a full `create or replace` of the original from 0001). The original 0001 version hit "column reference 'd' is ambiguous" because the PL/pgSQL loop variable and a CTE column alias both used the name `d` — with the default `plpgsql.variable_conflict = error`, Postgres refuses to guess. 0005 renames the variable to `v_day`; CTE stays as `d`.

Single transaction; order matters.

1. **Identify caller** via JWT email → lookup active `staff` row.
2. **Load settings** (5 reads).
3. **Gate check** via `get_gate_info()` — reject if `gate_open` is false or if `[p_start, p_end]` falls outside `range_from..range_to`.
4. **Fail-fast validation:** non-null dates, `end >= start`, consecutive-days bound `[min_consecutive, max_consecutive]`.
5. **Advisory locks** — released on COMMIT/ROLLBACK:
   - **User-scoped first:** `pg_advisory_xact_lock(hashtextextended('staff:' || work_id, 0))` — serializes a single user's concurrent submits.
   - **Per-day next:** one lock per date in the range, keyed by `round || ':' || date`. Ordering is intentional (user → days) to keep lock ordering consistent and deadlock-free across concurrent callers.
6. **Personal round cap** — sum of `days` for `(work_id, current_round, approved)` + requested `days` must be `≤ max_per_person`.
7. **Annual points** — `count(*)` of `(work_id, booking_year, approved)` must be `< annual_points_per_person`. `booking_year` comes from `start_date` (the generated column).
8. **Per-day capacity** — GIST range-overlap query expands overlapping approved bookings into one row per day, counts, and collects dates hitting `>= max_per_day` as `blocked_dates`.
9. **Insert** with `approved=true`, `submitted_at = v_arrival` (captured before any locks), `round = current_round`.

All error returns use `{success:false, error, details?}` with zh-TW messages.

**Why `v_arrival` is captured pre-lock:** priority ordering is by the timestamp the client's request *arrived*, not the moment Postgres finally commits the row. Two users who click submit within the same second should be ordered by arrival, not by who won the advisory lock.

---

## 8. Realtime bookings subscription

[`useBookings`](src/hooks/useBookings.js) implements the **subscribe-then-SELECT** pattern documented in-file ([useBookings.js:4-17](src/hooks/useBookings.js#L4-L17)):

1. Open a Postgres-changes channel filtered by `round=eq.${currentRound}`, event `INSERT`.
2. While `isBuffering` is true, push incoming rows into an in-memory buffer.
3. Only once the channel reports `SUBSCRIBED`, run the initial `SELECT * FROM bookings WHERE round=?`.
4. Merge the SELECT result with the buffer, dedupe by `id`, sort by `submitted_at asc`, then flip `isBuffering=false` and go live.
5. Subsequent INSERTs are merged into state directly.

This closes the initial-load race where a naive SELECT-then-subscribe would drop INSERTs landing between the two calls — the hot-moment scenario when many users click submit at 20:00:00 sharp.

**Status values** exposed: `connecting`, `live`, `reconnecting`, `error`. `PublicLog` surfaces `reconnecting` and `error` as banners and offers a manual `重新整理` button that calls `refresh()`.

---

## 9. Calendar/aggregate derivation

Two paths produce the per-date counts:

- **Client-side** ([`useCalendarData`](src/hooks/useCalendarData.js)) — `useMemo` expands each booking's date range and builds `{countByDate, namesByDate}`. This is what the grid actually reads, because it needs to update live in-tab as realtime INSERTs arrive.
- **Server-side** ([`get_calendar_data()`](supabase/migrations/0001_init.sql#L401-L440)) — a convenience RPC returning `{round, days:[{date, count, names}]}` for the current round, ordered by date. Currently **not called by the client**; retained for future admin/reporting tooling.

---

## 10. Annual points

[`useAnnualPoints`](src/hooks/useAnnualPoints.js) counts the caller's approved bookings for the current calendar year via a head-only SELECT (`count: 'exact', head: true`), filtered on the `booking_year` generated column. UI-only — the server re-checks in `submit_booking` step 7.

Shown in [`MyBookings`](src/components/MyBookings.jsx) as a progress bar (`annualUsed / 12`) alongside the round-days bar (`totalDays / maxPerPerson`). Bars turn red when full.

---

## 10a. Admin page (`/admin`)

[`AdminPage`](src/pages/AdminPage.jsx), gated on `staff.is_admin` in [App.jsx](src/App.jsx).

### 10a.1 Current-state card

Shows `get_gate_info()` rendered as a label grid: mode (override vs. default), open/closed, gate time, round, range. "Override active" is styled amber. If the client fetched a non-empty override from `settings` but `get_gate_info()` returned `override: false`, a yellow banner prompts the admin to clear the stale rows.

### 10a.2 Test mode card

Self-contained flow for dress rehearsals. Backed by [`start_test_mode`](supabase/migrations/0004_test_mode.sql) / [`end_test_mode`](supabase/migrations/0004_test_mode.sql).

- **Not active:** form with gate time (datetime-local, Taipei), range from/to, plus an "開始測試模式" button. Defaults are pre-filled: time = now, from = today, to = next-Sunday-on-or-after (today + 6 months). On submit calls `start_test_mode(p_gate_time, p_range_from, p_range_to)`, which generates a unique `TEST-YYYYMMDD-HHMI` round id, installs it as the active gate override, and records it in `settings.test_active_round`. Rejects if a test is already running.
- **Active:** blue-bordered card with 進行中 pill, the test round id, a live count of bookings tagged with that round (plain `select count(*)` scoped to the round), and a red "結束測試並刪除測試預約" button. `end_test_mode()` exact-matches on `round = test_active_round`, belt-and-braces checks the round label starts with `TEST-`, deletes matching `bookings` rows, then blanks all override slots + `test_active_round`. Real-round bookings (`YYYY-MM`) are never touched by this path.

The client-side confirm dialog surfaces the exact deletion count before the RPC is called.

### 10a.3 Gate override card

Non-test override — same override slots, but the admin can pick any round label including `YYYY-MM` overlap with a real round. Form: gate time (datetime-local, Taipei), range from/to, round label. "儲存並套用" calls [`set_gate_override`](supabase/migrations/0002_gate_override.sql); "清除自訂設定" calls [`clear_gate_override`](supabase/migrations/0002_gate_override.sql).

Auto-fill: picking a gate time populates `from = gate_date`, `to = next-Sunday-on-or-after(gate_date + 6 months)`, `round = YYYY-MM` of gate date — only if the field was empty. Manual edits are preserved. The front-end's `taipeiLocalToISO` appends `+08:00` to the `datetime-local` string (Taipei is UTC+8 constant, no DST), so the ISO sent to the server matches the admin's wall clock regardless of browser timezone.

---

## 10b. Records page (`/records`)

[`RecordsPage`](src/pages/RecordsPage.jsx). Any registered user can view — read access matches the RLS policy that grants `SELECT` on `bookings` to `authenticated`.

- Filters: dropdown over `round` (distinct values pulled on mount) + "僅顯示我的" checkbox scoping to `staff.work_id`.
- Summary: 共 N 筆, 總計 M 天.
- Query: `select * from bookings order by submitted_at desc limit 1000`, with `round` / `staff_work_id` filters applied conditionally.
- Rendering: table on desktop, stacked cards on mobile (see §13). "Mine" rows get a blue (`--c-selected`) background on both layouts.

---

## 10c. Help page (`/help`)

[`HelpPage`](src/pages/HelpPage.jsx). Static zh-TW usage guide: open time, how to select dates, rule summary, calendar color legend, and pointers to other pages. Numeric values (4–10 days, 14 days/round, 12 annual points) are hard-coded in the text — the component comment calls out that if an admin edits `settings`, this page must be updated to match.

---

## 11. Time handling

All server-side date math anchors to `Asia/Taipei` ([migration L131-L145](supabase/migrations/0001_init.sql#L131-L145)). The client makes two distinct choices:

- **Date-only** (`start_date`, `end_date`, `range_from`, `range_to`) — treated as opaque `YYYY-MM-DD` strings rendered through local-wall-clock `Date` objects. No TZ math. See comment in [src/lib/dateUtils.js:1-9](src/lib/dateUtils.js#L1-L9).
- **Timestamps** (`submitted_at`, `gate_time`) — rendered through `Intl.DateTimeFormat` bound to `Asia/Taipei` via [`fmtTaipeiTime`](src/lib/dateUtils.js#L77-L80) / [`fmtTaipeiDateTime`](src/lib/dateUtils.js#L82-L85). The countdown uses `msUntil` + `splitDuration` with local `Date.now()` — rounding errors are bounded by the once-per-minute server refetch.

---

## 11a. Responsive layout

[`useMediaQuery`](src/hooks/useMediaQuery.js) exposes `useMediaQuery(query)` and `useIsMobile()` (matches `(max-width: 639px)`). Subscribes to `MediaQueryList.change` so resizing mid-session swaps layouts without a reload.

Consumers today: [`PublicLog`](src/components/PublicLog.jsx) and [`RecordsPage`](src/pages/RecordsPage.jsx). Both render a horizontal-scroll table on desktop and a stacked card list on mobile. The rest of the app uses flexible layouts (`flex-wrap`, `grid auto-fit`) and doesn't need the hook.

Tables that stay on desktop add `white-space: nowrap` to date-range, round, timestamp, and work-id columns to prevent ugly mid-string wrapping when the viewport is just-barely wide enough.

---

## 12. PWA

[`vite.config.js`](vite.config.js) configures `vite-plugin-pwa` with `registerType: 'autoUpdate'`. Manifest: `藥師預假系統`, `#0891b2` theme, portrait standalone, with 192/512 icons plus a maskable 512 (80% safe-zone) for Android's install prompt.

iOS-specific metadata (apple-touch-icon 180×180, `apple-mobile-web-app-capable`, status-bar style, app title) is declared in [index.html](index.html) because iOS ignores the manifest `icons` array for home-screen saves.

Icons are generated from SVG masters via `node scripts/generate-icons.mjs` (see [scripts/generate-icons.mjs](scripts/generate-icons.mjs)). Output PNGs are committed so Vercel builds don't require `sharp`.

---

## 13. Business rules (summary)

Pulled directly from settings values + `submit_booking`:

- Gate opens **20:00 Asia/Taipei on the first Saturday** of each month, unless an admin override is set (see §4.2).
- Bookable window: **gate date → next Sunday on/after gate date + 6 months**.
- **One consecutive block of 4–10 days** per submission (0006 raised the upper bound from 7).
- **Max 14 days per person per round**, counted against approved bookings.
- **Max 2 people per day**.
- **12 annual points per person**, one per booking, counted by `booking_year = EXTRACT(YEAR FROM start_date)`.
- Auto-approved on submit. **No cancellation path** exists in user code. Admin can end a test round (deletes tagged rows) or clear an override (leaves bookings in place).
- Priority is by `submitted_at` (server-captured pre-lock).
- All numeric settings are editable live via the `settings` table — no code change needed. The help page text will get out of sync until manually updated.

---

## 14. Deployment model

- Frontend: Vercel auto-deploys on push to `main` (per [README.md](README.md)). Client-side routing survives hard-refresh via [vercel.json](vercel.json)'s catch-all rewrite to `/index.html`.
- Backend: Supabase project provisioned manually per [SUPABASE_SETUP.md](SUPABASE_SETUP.md); migrations applied in order via SQL editor.
- Secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Vercel env; `.env` locally.

When re-running migrations against a fresh DB, apply 0001 → 0006 in order. Each is wrapped in its own `begin/commit`.

---

## 15. Known gaps / deferred

Discoverable by grep in the current code:

- `/admin` now covers gate-time control (override + test mode) but **does not** cover staff management, numeric-setting edits via UI, or CSV export. Admin still edits staff / numeric settings directly in the Supabase table editor.
- `public.rounds` table is defined but unused — no round-closing job, no historical archive. [`RecordsPage`](src/pages/RecordsPage.jsx) browses `bookings` directly instead.
- `get_calendar_data()` RPC is defined but not called from the client — calendar counts are derived client-side in [`useCalendarData`](src/hooks/useCalendarData.js).
- `approved=false` bookings are filtered out of every server check, but there's no code path that ever sets `approved=false` (only `end_test_mode` removes rows, and it deletes instead of flipping the flag).
- Help page rule numbers (4–10 days, 14/round, 12/year) are hard-coded; editing `settings` does not update the help text.
- Expired override rows sit in `settings` until admin clicks "清除自訂設定" — `get_gate_info()` ignores them but they aren't auto-deleted.
- A test round's bookings count against the same per-day / per-person / annual caps as real rounds during the test window, because `submit_booking` filters only on `round = current_round`. Since `end_test_mode` deletes the test rows, the effect is transient but real while the test is running.
- [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md) is the source-of-truth design doc; this spec describes the implementation.
- Legacy GAS reference files ([gas_code.js](gas_code.js), [vacation_booking.html](vacation_booking.html)) are kept for reference only.
