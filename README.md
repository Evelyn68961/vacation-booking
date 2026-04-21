# Vacation Booking System v2

Pharmacist vacation pre-booking system with monthly gate opening, realtime calendar, annual point budget, and Google sign-in.

## Stack

- **Frontend:** Vite + React + PWA ([vite-plugin-pwa](https://vite-pwa-org.netlify.app/))
- **Backend:** Supabase Postgres (RLS + RPC + Realtime)
- **Auth:** Supabase Google OAuth
- **Hosting:** Vercel (auto-deploy on push to `main`)

## Status

Phase 1 in development. Target launch: 2026-05-02 (first real booking round). See [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md) for the full plan.

## First-time setup

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) end to end (~30 min). When you're done, `.env` will have the Supabase URL + anon key and you can run `npm run dev`.

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
├── App.jsx                 # Auth gate + route switching
├── main.jsx                # Vite entry
├── index.css               # Design tokens + component styles
├── lib/
│   ├── supabase.js         # Supabase client
│   └── dateUtils.js        # Date + Asia/Taipei timezone helpers
├── hooks/                  # useAuth, useGateInfo, useBookings, ...
├── components/             # StatusBar, MiniCalendar, BookingPanel, ...
└── pages/                  # BookingPage, RegisterPage

supabase/
├── migrations/0001_init.sql    # Schema + RLS + RPCs (one-time apply)
└── tests/                      # SQL test scripts

staff_template.csv          # CSV template for importing pharmacist roster
```

## Documentation

| Doc | Purpose |
|---|---|
| [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md) | System design, business rules, database schema |
| [ANNUAL_POINTS_PLAN.md](ANNUAL_POINTS_PLAN.md) | Annual points + auto-approval (boss request) |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Zero-to-production setup walkthrough |

## Business rules (summary)

- Gate opens at 20:00 on the first Saturday of every month (Asia/Taipei)
- Bookable window: gate day → 6 months ahead
- Each submission: one consecutive block of 4–7 days
- Max 14 days per person per round
- Max 2 people per day
- **12 points per person per year**, 1 booking = 1 point (counted by start-date year)
- Auto-approved on submit; no cancellation
- Priority by server-side timestamp

## Legacy files

`gas_code.js` and `vacation_booking.html` are the previous GAS-based implementation, kept only as code reference (date utilities, UI layout). Not maintained. Not a deployed system.
