# 預假系統 v2 — Project Plan

## Overview

Replace the GAS-based vacation pre-booking system with a scalable web app that handles 60+ concurrent users. Same business rules, new stack.

**Repo:** `Evelyn68961/vacation-system-v2` (new)
**Deploy:** Vercel (auto-deploy on push to `dev` branch)
**Language:** Traditional Chinese (default)

---

## Why v2

**v1 (GAS) problems:**
- Slow writes (2–4s per booking) — unacceptable at 60 concurrent users
- `LockService` serializes all submissions → last person waits 30+ seconds
- Polling-based refresh (15s) shows stale calendar during critical window
- `new Date()` captured after lock release, not at arrival → unfair priority

**v2 solves these via:**
- Postgres transactions (sub-second writes)
- Supabase Realtime (instant calendar updates via websocket)
- `now()` captured at transaction start, before any lock wait
- Google OAuth identity (no more name spoofing)

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast dev loop, actively maintained; CRA deprecated since 2023 |
| Hosting | Vercel | Same as other projects |
| Database | Supabase Postgres | Same as Slidecast — familiar RLS patterns |
| Auth | Supabase + Google OAuth | One-click login, identity verified |
| Realtime | Supabase Realtime (websocket) | Instant cross-client updates |
| PWA | `vite-plugin-pwa` (Workbox under the hood) | Home screen install, offline reads |
| Timezone | `Asia/Taipei` (enforced in SQL) | All gate math + `submitted_at` display anchored here |

---

## Business Rules (unchanged from v1)

- Gate opens 8:00 PM first Saturday of each month
- Bookable window: gate day → 6 months ahead
- Each submission: 1 consecutive block of 4–7 days
- Multiple blocks per person allowed
- Max 14 days per person per round
- Max 2 people per day
- No cancel once submitted
- Priority by server timestamp

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│  Browser / PWA (React, Vercel-hosted)              │
│                                                    │
│  Routes:                                           │
│  /           → Booking page (everyone)             │
│  /register   → First-time work ID registration     │
│  /admin      → Admin dashboard (Evelyn + 學長)      │
└──────────┬─────────────────────────────────────────┘
           │
           │ ① submit_booking()  ② realtime subscribe
           │                     to bookings INSERTs
           ▼
┌────────────────────────────────────────────────────┐
│  Supabase                                          │
│                                                    │
│  Auth: Google OAuth                                │
│                                                    │
│  Postgres tables:                                  │
│  • staff         (work_id, name, email, is_admin)  │
│  • bookings      (staff's bookings)                │
│  • settings      (key/value rules)                 │
│  • rounds        (historical round archive)        │
│                                                    │
│  RPC functions:                                    │
│  • register_staff(work_id)                         │
│  • submit_booking(start, end)                      │
│  • get_gate_info()                                 │
│  • get_calendar_data()                             │
│  • is_admin()          -- reads auth.jwt() itself  │
│                                                    │
│  Realtime: bookings INSERTs broadcast to all       │
│  RLS: read = authenticated; write = via RPC only   │
└────────────────────────────────────────────────────┘
```

---

## Database Schema

### `staff`
| Column | Type | Notes |
|---|---|---|
| work_id | text PK | e.g. "P12345" |
| name | text NOT NULL | 姓名 |
| email | text UNIQUE | NULL until registered |
| is_admin | boolean DEFAULT false | |
| active | boolean DEFAULT true | |
| registered_at | timestamptz | |
| created_at | timestamptz DEFAULT now() | |

### `bookings`
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| staff_work_id | text NOT NULL FK → staff(work_id) | |
| name | text NOT NULL | Snapshot at submission time |
| start_date | date NOT NULL | |
| end_date | date NOT NULL | |
| days | int NOT NULL | |
| submitted_at | timestamptz NOT NULL | Captured pre-lock for display/sort. Does **not** decide slot allocation — see priority note below. |
| round | text NOT NULL | e.g. "2026-05" |

Indexes:
- `(round)` — scoped lookups
- `(staff_work_id, round)` — personal cap check
- GIST on `daterange(start_date, end_date, '[]')` — used by overlap query in `submit_booking` capacity check

### `settings`
| Column | Type |
|---|---|
| key | text PK |
| value | text NOT NULL |

Default rows: `max_per_day=2`, `max_per_person=14`, `min_consecutive=4`, `max_consecutive=7`

### `rounds` (future — for Phase 2 history view)
| Column | Type |
|---|---|
| round_id | text PK (e.g. "2026-05") |
| gate_time | timestamptz |
| range_from | date |
| range_to | date |
| closed_at | timestamptz |

---

## Key RPC Functions

### `submit_booking(p_start, p_end)`

The critical path. All validation + write in a single Postgres transaction. Language of error strings: zh-TW (matches UI).

```
 1. v_arrival := now()                                 -- pre-lock, for display/sort
 2. v_email := (auth.jwt() ->> 'email')
 3. Verify email linked to active staff → v_staff (work_id, name)
 4. Get settings (min/max days, caps)
 5. Get gate info (is_open, current_round, range)      -- TZ-aware, Asia/Taipei
 6. Fail-fast validation (no lock yet):
      - Gate open?
      - Day count in [min_consecutive, max_consecutive]?
      - Within bookable range?
 7. Acquire per-day advisory locks (scoped, not round-wide):
      FOR d IN generate_series(p_start, p_end, '1 day'):
        PERFORM pg_advisory_xact_lock(
          hashtextextended(current_round || ':' || d::text, 0)
        )
      -- Only conflicts with other submissions touching the SAME day(s).
      -- Released automatically at COMMIT/ROLLBACK.
 8. Inside the locked region:
      a. Personal cap:
           SELECT COALESCE(SUM(days),0) INTO v_existing
             FROM bookings
             WHERE staff_work_id = v_staff.work_id AND round = current_round;
           IF v_existing + v_days > max_per_person → reject.
      b. Per-day capacity via GIST range overlap:
           SELECT start_date, end_date
             FROM bookings
             WHERE round = current_round
               AND daterange(start_date, end_date, '[]')
                   && daterange(p_start, p_end, '[]');
           Expand overlapping rows into per-date counts across [p_start, p_end];
           IF any date count >= max_per_day → reject with the full list of blocked dates.
 9. INSERT into bookings (..., submitted_at = v_arrival, round = current_round).
10. RETURN { success: true, booking } — or { success: false, error, details } on any rejection.
```

**Priority semantics (documented tradeoff):**
`submitted_at` reflects each client's pre-lock arrival and drives the public log sort. Slot *allocation* under contention is decided by advisory-lock acquisition order, which is "first to commit wins" — Postgres does not guarantee FIFO for advisory locks. Under expected load (≤60 users, conflicts on individual days only) this tracks arrival order closely enough. If strict FIFO is ever required, replace the advisory lock with an arrival-sorted queue table processed by a worker — deferred until there is evidence of unfairness.

### `register_staff(p_work_id)`

One-time linking of Google email to pre-registered work ID.

```
1. v_email := (auth.jwt() ->> 'email'); require non-null
2. Reject if v_email already linked to a different work_id
3. Look up p_work_id in staff table
4. Reject if not found or inactive
5. Reject if work_id already linked to a different email
6. UPDATE staff SET email = v_email, registered_at = now() WHERE work_id = p_work_id
7. RETURN { success, name, work_id } or { error }
```

### `get_gate_info()`

Server-side gate time calculation. **All time math anchored to `Asia/Taipei`** to avoid the UTC-drift bug v1 never hit only by luck.

```
v_now        := now() AT TIME ZONE 'Asia/Taipei'        -- timestamp, local wall clock
v_month_1st  := date_trunc('month', v_now)::date
v_gate_date  := v_month_1st + ((6 - extract(dow from v_month_1st)::int + 7) % 7)
v_gate       := (v_gate_date + time '20:00') AT TIME ZONE 'Asia/Taipei'   -- timestamptz
IF now() > v_gate:
  roll v_gate to first Saturday of next Taipei month at 20:00
v_range_from := v_gate_date
v_range_to   := v_gate_date + interval '6 months'
v_round      := to_char(v_gate AT TIME ZONE 'Asia/Taipei', 'YYYY-MM')
RETURN { gate_open: now() >= v_gate, gate_time: v_gate, current_round: v_round,
         range_from: v_range_from, range_to: v_range_to }
```

All callers (`submit_booking`, frontend countdown, realtime filter) must treat `gate_time` as `timestamptz` and render through `Asia/Taipei`.

### `is_admin()`

`SECURITY DEFINER` function that reads `auth.jwt() ->> 'email'` internally and returns `true` iff that email maps to a staff row with `is_admin = true`. Takes no argument — callers never pass an email they claim is theirs; the JWT is the source of truth. This also avoids the RLS recursion that hits when policies inline `EXISTS(SELECT FROM staff)`.

---

## RLS Policies

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| staff | `authenticated` (all rows) | Admin only (via RPC) |
| bookings | `authenticated` (all rows) | Only via `submit_booking` RPC (no direct writes) |
| settings | `authenticated` (all rows) | Admin only (via RPC) |

**Critical rule (from SUPABASE_RLS_LESSONS.md):** Use `is_admin()` as `SECURITY DEFINER` function, never inline `EXISTS(SELECT FROM staff)` in policy → infinite recursion.

**Privacy note on `authenticated` SELECT:** any Google-logged-in user — including random outsiders who happen to click the login button — will see the full staff table and every booking. Work IDs are treated as public info, so this is acceptable for the initial launch. If it ever stops being acceptable, tighten `staff` SELECT to `auth.jwt() ->> 'email' IN (SELECT email FROM staff WHERE active)` and route an anonymous `/register` landing through a `SECURITY DEFINER` lookup instead.

---

## Frontend Structure

```
index.html                    # Vite entry (project root, not public/)
vite.config.js                # React plugin + vite-plugin-pwa
src/
├── main.jsx                  # ReactDOM render
├── App.jsx                   # Router + auth gate
├── lib/
│   ├── supabase.js           # Supabase client
│   └── dateUtils.js          # fmtDate, parseDate, daysBetween, expandRange — Asia/Taipei aware
├── hooks/
│   ├── useAuth.js            # Google login state + staff profile
│   ├── useGateInfo.js        # Gate status + countdown
│   ├── useBookings.js        # Realtime: subscribe → SELECT → dedupe by id (race-safe)
│   └── useCalendarData.js    # Derived {date: count} map
├── components/
│   ├── StatusBar.jsx         # 🔴/🟢 indicator + countdown + round label
│   ├── MiniCalendar.jsx      # Single month grid
│   ├── CalendarGrid.jsx      # 7 months layout
│   ├── BookingPanel.jsx      # Selection display + validation + submit
│   ├── ConfirmDialog.jsx     # "無法取消" warning modal
│   ├── PublicLog.jsx         # Live-sorted booking table
│   ├── MyBookings.jsx        # Personal quota + block list
│   └── LoginButton.jsx       # Google sign-in
└── pages/
    ├── BookingPage.jsx       # Main page (/) — assembles everything
    ├── RegisterPage.jsx      # First-time work ID registration (/register)
    └── AdminPage.jsx         # Admin dashboard (/admin) — Phase 2
```

**Auth gate flow in App.jsx:**
```
if (not logged in)              → show LoginButton
else if (email not registered)  → redirect to /register
else if (path = /admin && !is_admin) → redirect to /
else                            → render matching route
```

---

## Realtime Strategy

Subscribe to `bookings` table INSERT events for the current round. On new row:
- Prepend to `bookings` state → PublicLog auto-updates
- Recompute `calendarData` → MiniCalendars recolor days

```javascript
supabase
  .channel('bookings-live')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bookings',
        filter: `round=eq.${currentRound}` },
      (payload) => setBookings(prev => [...prev, payload.new])
  )
  .subscribe();
```

**Initial-load race (don't skip this).** Naive order — `SELECT` then `subscribe()` — drops any INSERT that lands between the two calls, which is precisely the busiest moment at 20:00:00. Correct sequence inside `useBookings.js`:

1. `subscribe()` first; route incoming payloads into a buffer array
2. Then `SELECT * FROM bookings WHERE round = currentRound`
3. Merge buffer into SELECT result, dedupe by `id`, sort by `submitted_at`
4. Flip to normal mode: new payloads append directly to state, still deduped by `id`

**Reconnection handling:** on subscription status change to `CLOSED` or `CHANNEL_ERROR`, show banner "即時更新已中斷，正在重連…", retry with exponential backoff, and expose a manual refresh button as belt-and-suspenders.

---

## User Flows

### First-time setup (before gate opens)
1. Admin bulk-loads staff CSV (name, work_id) into Supabase
2. Admin announces registration URL to team
3. Each pharmacist: open app → "使用 Google 登入" → enter work ID → done

### Normal booking (gate day)
1. Open app (via home screen icon if PWA-installed)
2. Already logged in from last time
3. See gate countdown + live calendar
4. At 20:00 → calendar becomes clickable
5. Pick start + end dates → review validation → submit
6. See confirmation → public log updates for everyone simultaneously

### Admin (Phase 2)
- Staff management (add/remove/disable pharmacists)
- Settings editor (adjust rules without code)
- CSV export of current round
- Round archive browser

---

## Phased Build

### Phase 1 — Core replacement (ship by Friday May 1)
**Goal:** 60 pharmacists can book on May 2 without GAS slowness.

- [ ] Supabase project setup (auth, tables, RLS, RPCs)
- [ ] Staff CSV import (boss provides list)
- [ ] Vite + React project init (`npm create vite@latest`) with `vite-plugin-pwa`
- [ ] Google OAuth via Supabase
- [ ] Registration page + flow
- [ ] Booking page port from v1 HTML
- [ ] Realtime subscription for bookings + calendar
- [ ] Vercel deployment + environment vars
- [ ] **Unit-test `get_gate_info()`** across all 7 possible `extract(dow from month_1st)` values — catches the Saturday-offset arithmetic regressing silently
- [ ] **Load test:** 60 parallel `submit_booking` calls via k6 or a Node script — verify zero oversells, p95 < 1s, no deadlocks
- [ ] End-to-end smoke test with 2 real accounts for UX flow
- [ ] **Dress rehearsal on staging** (Thu or Fri before May 2) — fake gate time set 10 min ahead, Evelyn + 1–2 volunteers exercise the full flow, including a deliberate oversell attempt
- [ ] Verify Vercel keeps last-green deploy reachable for one-click rollback if the gate-day deploy regresses
- [ ] Announce to team, registration open

### Phase 2 — Polish (after May 2 round)
- [ ] Admin dashboard (`/admin`)
- [ ] Settings editor UI
- [ ] CSV export
- [ ] Staff management UI
- [ ] Round history browser
- [ ] PWA service worker hardening (cache strategy, update UI)
- [ ] iOS PWA install instructions

### Phase 3 — Future (deferred)
- LINE notifications when gate opens
- Cooldown between submissions
- Holiday awareness
- Bilingual toggle (if needed)

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Staff don't register before May 2 | Announce Tuesday, remind Thursday, admin hotline Friday |
| Realtime disconnects mid-gate | Reconnect w/ backoff + manual refresh button; subscribe-then-SELECT avoids drop on reload |
| Postgres lock contention at 20:00 | **Per-day** advisory locks (not round-wide); load-tested at 60 concurrent submits before ship |
| Timezone drift (server UTC vs Taipei) | All gate math + `submitted_at` rendering explicitly `AT TIME ZONE 'Asia/Taipei'` |
| Google OAuth down at gate time | Session tokens last 30 days, so already-logged-in users unaffected |
| Someone registers with wrong work ID | Admin can unlink via Supabase dashboard |
| v2 fails at gate time | No external fallback — mitigate upstream: staging dress rehearsal Thu/Fri, Vercel instant rollback to last-green deploy, Supabase monitoring open during gate window. If everything fails, Evelyn collects bookings manually and backfills via admin tools after the fact. |

---

## Launch Posture

**This is a greenfield ship with no external fallback.** Only the v2 URL will be announced — there is no prior system to revert to if things go wrong at 20:00 on May 2.

**Data:** Start fresh. May 2 is the first real round; no historical bookings to migrate.

**Users:** All ~60 pharmacists onboard for the first time via Google login + work ID. One-time cost.

**Legacy reference:** the local GAS/HTML files are useful as code reference (date utils, gate algorithm, UI layout) but are not a deployed system and must not surface in any stakeholder-facing material.

---

## Open Questions (decided)

- ✅ Backend: Supabase
- ✅ Frontend: Vite + React + `vite-plugin-pwa` (CRA dropped — unmaintained since 2023)
- ✅ Auth: Google OAuth
- ✅ Registration: work ID + email linking
- ✅ Realtime: yes, websocket subscriptions — subscribe-then-SELECT to close the initial-load race
- ✅ Overview: public live view on main page + `/admin` for Evelyn & 學長
- ✅ Work IDs: public info, no second factor needed
- ✅ Deadline: May 2 (this Saturday)
- ✅ Concurrency: per-day `pg_advisory_xact_lock` (not round-wide, not FIFO queue)
- ✅ Timezone: all gate math anchored to `Asia/Taipei`
- ✅ Error messages: zh-TW in both UI and RPC return values

---

## Files to Deliver

### Phase 1
- `VACATION_SYSTEM_V2_PLAN.md` (this file)
- `supabase/migrations/0001_init.sql` — tables, indexes, RLS, RPCs (versioned for future migrations)
- `staff_template.csv` — for boss to fill in
- Vite React project (see Frontend Structure above)
- `loadtest/` — k6 or Node script simulating 60 concurrent `submit_booking` calls
- `README.md` — setup + deployment guide, including the Vercel rollback procedure and gate-day monitoring checklist

### Phase 2
- Admin dashboard components
- PWA manifest + service worker config
- Migration notes
