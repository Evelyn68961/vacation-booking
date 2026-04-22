# Vacation Booking System v2

Pharmacist vacation pre-booking system with monthly gate opening, realtime calendar, annual point budget, admin-controlled test mode, and Google sign-in.

## Stack

- **Frontend:** Vite + React + PWA ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/))
- **Backend:** Supabase Postgres (RLS + `SECURITY DEFINER` RPCs + Realtime)
- **Auth:** Supabase Google OAuth
- **Hosting:** Vercel (auto-deploy on push to `main`)

## Status

Target launch: 2026-05-02 (first real booking round). See [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md) for the original plan, [SPEC.md](SPEC.md) for the spec of the actual implementation.

## First-time setup

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) end to end (~30 min). When you're done, `.env` will have the Supabase URL + anon key and you can run `npm run dev`. Apply migrations `0001` → `0007` in order. You can skip the CSV-import step — staff rows are created on first login (migration 0007).

## Dev commands

```bash
npm install          # Install dependencies (first time only)
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build → dist/
npm run preview      # Serve the production build locally
```

## Project structure

```
src/
├── App.jsx                    # Auth gate + route switching (/, /help, /records, /admin)
├── main.jsx                   # Vite entry
├── index.css                  # Design tokens + component styles
├── lib/
│   ├── supabase.js            # Supabase client
│   └── dateUtils.js           # Date + Asia/Taipei timezone helpers
├── hooks/
│   ├── useAuth.js             # Session + staff profile
│   ├── useGateInfo.js         # Polls get_gate_info RPC once a minute
│   ├── useBookings.js         # Realtime subscription (subscribe-then-SELECT)
│   ├── useCalendarData.js     # Derived per-date counts
│   ├── useSettings.js         # Reads settings table
│   ├── useAnnualPoints.js     # Per-user yearly counter
│   └── useMediaQuery.js       # useIsMobile for responsive tables
├── components/
│   ├── StatusBar.jsx          # Round, countdown, route links (說明/紀錄/管理/登出)
│   ├── LoginButton.jsx
│   ├── MiniCalendar.jsx
│   ├── CalendarGrid.jsx
│   ├── BookingPanel.jsx
│   ├── MyBookings.jsx
│   ├── PublicLog.jsx          # Current-round log, responsive
│   └── ConfirmDialog.jsx
└── pages/
    ├── BookingPage.jsx        # Main booking UI + closed-state overlay
    ├── RegisterPage.jsx       # First-time work_id linking
    ├── HelpPage.jsx           # Static zh-TW usage guide
    ├── RecordsPage.jsx        # Historical browser (all users, responsive)
    └── AdminPage.jsx          # Gate override + test mode (is_admin only)

supabase/
├── migrations/
│   ├── 0001_init.sql                            # Tables, indexes, RLS, core RPCs
│   ├── 0002_gate_override.sql                   # Admin-controlled gate override
│   ├── 0003_extend_range_to_sunday.sql          # range_to snaps to next Sunday
│   ├── 0004_test_mode.sql                       # start_/end_test_mode
│   ├── 0005_fix_submit_booking_variable_conflict.sql  # Fix "column d ambiguous"
│   ├── 0006_max_consecutive_10.sql              # Raise 7 → 10 days
│   └── 0007_register_staff_creates_rows.sql     # Self-registration creates staff row on first login
└── tests/                                       # SQL test scripts

staff_template.csv             # CSV template for importing pharmacist roster
vercel.json                    # SPA catch-all rewrite to /index.html
```

## Documentation

| Doc | Purpose |
|---|---|
| [SPEC.md](SPEC.md) | Live specification of the implementation (kept current) |
| [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md) | Original system design + business rules |
| [ANNUAL_POINTS_PLAN.md](ANNUAL_POINTS_PLAN.md) | Annual points + auto-approval (boss request) |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Zero-to-production setup walkthrough |

## Business rules (summary)

- Gate opens at 20:00 on the first Saturday of every month (Asia/Taipei) — admin can override per round or run a test mode
- Bookable window: gate day → next Sunday on/after gate day + 6 months
- Each submission: one consecutive block of 4–10 days
- Max 14 days per person per round
- Max 2 people per day
- **12 points per person per year**, 1 booking = 1 point (counted by start-date year)
- Auto-approved on submit; no user-facing cancellation
- Priority by server-side timestamp

## Admin operations

`/admin` (visible only to `is_admin=true` staff):

- **Gate override** — pin a custom gate time, bookable range, and round label. Auto-expires when the month *after* the override's gate month reaches its first-Saturday 20:00.
- **Test mode** — spin up a temporary booking window tagged with a unique `TEST-YYYYMMDD-HHMI` round. Ending the test deletes all rows with that tag; real-round bookings are never touched.

Staff edits, CSV export, and numeric setting changes still go through the Supabase table editor.

## Legacy files

`gas_code.js` and `vacation_booking.html` are the previous GAS-based implementation, kept only as code reference (date utilities, UI layout). Not maintained. Not a deployed system.
