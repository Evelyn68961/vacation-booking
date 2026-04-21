# Supabase Setup — 預假系統 v2

Step-by-step to get the backend ready. Allow ~20 minutes total (local setup) + ~10 minutes for Vercel deploy.

## 1. Create the project

1. Go to https://supabase.com → **New project**.
2. Name: `vacation-booking` (or whatever you prefer).
3. Database password: generate a strong one and save it somewhere safe — you'll rarely need it but can't recover it.
4. Region: **Northeast Asia (Tokyo)** — closest to Taipei, keeps latency low for 60 concurrent users.
5. Plan: Free tier is fine for launch (500MB DB, 2GB transfer/month — we'll use a fraction of that).
6. Click **Create new project** and wait ~2 minutes for provisioning.

## 2. Apply the schema migration

1. In the project dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) in your editor, copy the entire contents, paste into the SQL Editor.
4. Click **Run** (or `Ctrl+Enter`).
5. Expect: "Success. No rows returned." If you see an error, stop and share it — don't manually edit and retry, the migration should apply cleanly.

Verify: in **Table Editor**, you should see four tables — `staff`, `bookings`, `settings`, `rounds`. The `settings` table should have 5 rows (max_per_day=2, max_per_person=14, min_consecutive=4, max_consecutive=7, annual_points_per_person=12).

## 3. Enable Google OAuth

1. **Authentication → Providers → Google** → toggle **Enabled**.
2. You need a Google OAuth client. Two options:
   - **Quick (recommended for launch):** click **Use Supabase's demo app** — fine for a ~60-user internal tool.
   - **Proper:** create your own in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Web application. Set authorized redirect URI to the one Supabase shows you (`https://<project>.supabase.co/auth/v1/callback`). Paste client ID + secret back into Supabase.
3. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:5173` for now. Change to the Vercel production URL once deployed (see step 8).
   - **Redirect URLs:** add `http://localhost:5173/**` and later `https://<your-vercel-domain>/**`.
4. Save.

## 4. Import staff CSV

1. Fill in [staff_template.csv](staff_template.csv) with the real pharmacist list from the boss. Columns: `work_id, name, is_admin, active`.
2. Make sure your own row has `is_admin=true`.
3. In **Table Editor → staff → Insert → Import data from CSV**, upload the file.
4. Verify the row count matches and your admin flag is set.

## 5. Paste credentials into `.env`

1. **Project Settings → API.**
2. Copy **Project URL** and **anon public** key.
3. In the repo root, create `.env` (not `.env.example` — `.env` is gitignored):
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Do **not** copy the `service_role` key — it bypasses RLS and must never ship to the frontend.

## 6. Smoke test

Back in the repo:
```bash
npm run dev
```
Open http://localhost:5173 — you should see the placeholder "預假系統 v2" page without console errors. If [src/lib/supabase.js](src/lib/supabase.js) throws about missing env vars, recheck step 5.

## 7. Register yourself

Once the registration flow is built, log in with Google, enter your own work_id, and confirm your row gets `email` + `registered_at` populated in the `staff` table.

---

## 8. Deploy to Vercel

1. Push the repo to GitHub (use GitHub Desktop).
2. Go to https://vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Vite** (auto-detected).
4. **Environment Variables** — add both:
   - `VITE_SUPABASE_URL` = `https://<project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJ...`
5. Click **Deploy** and wait ~1–2 minutes.
6. Note the production URL (e.g. `https://vacation-booking.vercel.app`).

> ⚠️ `vercel dev` does NOT work on the hospital workstation. This isn't a blocker for Phase 1 (no serverless functions), but keep in mind if you add Vercel-specific features later — you'll need to test via a deployed preview URL instead.

## 9. Update Supabase URLs for production

Now that you have the Vercel domain, go back to Supabase:

1. **Authentication → URL Configuration:**
   - **Site URL:** change to `https://<your-vercel-domain>`.
   - **Redirect URLs:** add `https://<your-vercel-domain>/**` (keep the localhost one so dev still works).
2. Save.

## 10. If using your own Google OAuth client

Skip this if you used Supabase's demo app in step 3.

1. Google Cloud Console → **Credentials** → your OAuth client.
2. **Authorized redirect URIs:** should already have `https://<project>.supabase.co/auth/v1/callback` from step 3.
3. **Authorized JavaScript origins:** add `https://<your-vercel-domain>`.
4. Save.

## 11. Production smoke test

1. Open `https://<your-vercel-domain>` in an incognito window.
2. Log in with Google → should redirect cleanly back to the app.
3. Confirm no console errors and that your staff row looks correct.

---

## When something goes wrong

- **Migration errors:** don't partially apply or hand-edit tables. Drop everything and re-run. In SQL Editor: `drop schema public cascade; create schema public; grant all on schema public to postgres, anon, authenticated, service_role;` then re-run the migration.
- **OAuth redirect loop:** double-check Site URL and Redirect URLs exactly match where you're running the app, including trailing slashes.
- **RLS rejecting reads after login:** confirm the logged-in email exists in `staff.email` and `active=true`. `is_admin()` silently returns false for unknown emails.
- **Realtime not firing:** in **Database → Replication**, make sure `bookings` has realtime enabled. If not, toggle it on.
- **Vercel build fails with "missing env var":** you forgot step 8.4. Add the vars in Vercel → Project Settings → Environment Variables, then redeploy.
- **Production login works but reads fail:** you forgot step 9. Site URL + Redirect URLs must include the Vercel domain.

## Reference

- Project dashboard: https://supabase.com/dashboard/project/<your-project-ref>
- SQL editor: Dashboard → SQL Editor
- Migration file: [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)
- Plan document: [VACATION_SYSTEM_V2_PLAN.md](VACATION_SYSTEM_V2_PLAN.md)
