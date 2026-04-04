# 預假系統 (Vacation Pre-booking System) — Project Plan

## Overview

A transparent, automated vacation pre-booking system for the pharmacy department. Single HTML file + Google Sheets backend via Google Apps Script (same architecture as UD藥品交車系統).

**Problem:** Current system relies on manual gate opening → human error → unfair outcomes.
**Solution:** Auto-calculated gate time, server-side timestamps, public audit log.

---

## Business Rules

### Gate Opening
- **When:** 8:00 PM on the first Saturday of each month
- **Auto-calculated:** GAS computes the next gate time from `new Date()` — no manual config needed
- **Logic:**
  1. Find first Saturday of current month, set 20:00
  2. If already passed → find first Saturday of next month, set 20:00
  3. All time checks use GAS server clock (not client-side)

### Bookable Date Range
- **From:** Today (the day of gate opening)
- **To:** 6 months ahead from today
- Example: Gate opens May 2, 2026 → bookable range = May 2 – Nov 2, 2026

### Booking Constraints
- **Consecutive days only:** Each submission = one block of 4–7 consecutive days
- **Multiple blocks allowed:** A person can submit several blocks across different periods
- **Total cap:** 14 days per person per round (configurable in Sheet)
- **Max 2 people per day:** If any day in the requested block already has 2 bookings, the entire block is rejected
- **No cancel, no rebook:** Once submitted and accepted, it's permanent
- **Priority:** Server-side timestamp (`new Date()` in GAS) determines who gets the slot when conflicts arise

### Staff List
- Stored in a "Staff" sheet tab — simple list of names
- Frontend renders as a dropdown
- Easy to add/remove people by editing the Sheet

---

## Architecture

### Google Sheet (Database)

**Tab 1: "Bookings"**
| Column | Description |
|--------|-------------|
| 姓名 | Staff name |
| 開始日期 | Block start date (YYYY-MM-DD) |
| 結束日期 | Block end date (YYYY-MM-DD) |
| 天數 | Number of days in block |
| 提交時間 | Server-side timestamp (GAS `new Date()`) |
| 輪次 | Round identifier (e.g., "2026-05") |

**Tab 2: "Staff"**
| Column | Description |
|--------|-------------|
| 姓名 | Staff member name |

**Tab 3: "Settings"**
| Column | Description |
|--------|-------------|
| 每日上限 | Max people per day (default: 2) |
| 每人上限 | Max total days per person per round (default: 14) |
| 最少天數 | Min consecutive days per block (default: 4) |
| 最多天數 | Max consecutive days per block (default: 7) |

Settings tab allows adjusting rules without code changes.

### Google Apps Script (Server)

**Endpoint: `doGet(e)`** — serves data based on `action` parameter.

| Action | Description | Returns |
|--------|-------------|---------|
| `getStatus` | Check if gate is open + gate time info | `{gateOpen: bool, gateTime: string, currentRound: string, bookableRange: {from, to}}` |
| `getBookings` | All bookings for current round | Array of booking records |
| `getStaff` | Staff name list | Array of names |
| `getSettings` | Read Settings tab | Settings object |
| `getCalendarData` | Aggregated: how many people booked each day | `{date: count}` map |

**Endpoint: `doPost(e)`** — handles booking submissions.

| Action | Description |
|--------|-------------|
| `submitBooking` | Validate + write a booking block |

**`submitBooking` validation sequence:**
1. Is the gate open? (`new Date()` >= computed gate time) → if no, reject
2. Parse request: name, startDate, endDate
3. Calculate day count → must be 4–7
4. Is every day in range within the bookable window? → if no, reject
5. Count person's existing booked days this round → would adding this block exceed 14? → if yes, reject
6. For each day in the block, count existing bookings → any day >= 2? → if yes, reject with message showing which day(s) are full
7. All checks pass → write row to Bookings tab with server timestamp → return success

**Gate time calculation (no manual config):**
```javascript
function getGateInfo() {
  const now = new Date();
  
  // Find first Saturday of current month
  let gate = new Date(now.getFullYear(), now.getMonth(), 1);
  while (gate.getDay() !== 6) gate.setDate(gate.getDate() + 1);
  gate.setHours(20, 0, 0, 0);
  
  // If passed, find first Saturday of next month
  if (now > gate) {
    gate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    while (gate.getDay() !== 6) gate.setDate(gate.getDate() + 1);
    gate.setHours(20, 0, 0, 0);
  }
  
  // Bookable range: today through 6 months ahead
  const rangeFrom = new Date(gate); // gate open date
  const rangeTo = new Date(gate);
  rangeTo.setMonth(rangeTo.getMonth() + 6);
  
  // Round ID = gate month
  const round = gate.getFullYear() + '-' + String(gate.getMonth() + 1).padStart(2, '0');
  
  return {
    gateOpen: now >= gate,
    gateTime: gate,
    currentRound: round,
    bookableRange: { from: rangeFrom, to: rangeTo }
  };
}
```

### Single HTML File (Frontend)

**Tech stack:** React 18 + Babel standalone + Tailwind CDN (same as UD system)

**Sections:**

#### 1. Status Bar (top)
- Gate status: 🔴 未開放 / 🟢 已開放
- Countdown timer to next gate opening (if closed)
- Current round info + bookable date range
- Auto-refreshes every second

#### 2. Calendar View (main area)
- Shows 6 months of mini-calendars (scrollable or paginated)
- Each day cell color-coded:
  - Green: 0 bookings (available)
  - Yellow/Amber: 1 booking (1 slot left)
  - Red: 2 bookings (full)
  - Gray: outside bookable range or past dates
- Click a start date → drag or click end date → highlights the block
- Shows validation in real-time: "5 consecutive days selected ✓" or "exceeds 7 days ✗"

#### 3. Booking Panel
- Name dropdown (populated from Staff tab)
- Selected date range display (start – end, N days)
- Validation messages:
  - Block length check (4–7 days)
  - Personal cap check (shows "已預約 X 天 / 上限 14 天")
  - Availability check per day
- Submit button (disabled when gate closed or validation fails)
- Confirmation step before final submit (since no cancel allowed)

#### 4. Public Log (bottom)
- Table showing ALL bookings for this round, sorted by submission time
- Columns: 姓名 | 日期區間 | 天數 | 提交時間
- Real-time refresh (poll every 10 seconds or manual refresh button)
- This is the transparency layer — equivalent to viewing the Sheet directly

#### 5. My Bookings (personal summary)
- Shows current user's booked blocks
- Remaining quota (e.g., "已用 9 天 / 14 天")
- No cancel button (by design)

---

## UI Wireframe Layout

```
┌─────────────────────────────────────────┐
│  預假系統           🟢 已開放  2026-05輪  │
│  可預約範圍: 05/02 – 11/02              │
├─────────────────────────────────────────┤
│                                         │
│  [May 2026]  [Jun 2026]  [Jul 2026]    │
│  ┌──┬──┬──┬──┬──┬──┬──┐                │
│  │  │  │  │  │  │ 1│ 2│  (color-coded) │
│  │ 3│ 4│ 5│ 6│ 7│ 8│ 9│                │
│  │  │  │██│██│██│██│██│  ← selected     │
│  └──┴──┴──┴──┴──┴──┴──┘                │
│                                         │
│  [Aug 2026]  [Sep 2026]  [Oct 2026]    │
│  ...                                    │
├─────────────────────────────────────────┤
│  姓名: [▼ 王小明        ]              │
│  選取: 05/05 – 05/09 (5天)             │
│  已預約: 0天 / 上限14天                 │
│  [✓ 確認送出預約]                       │
├─────────────────────────────────────────┤
│  公開紀錄                    [重新整理]  │
│  王小明  05/05–05/09  5天  20:00:03     │
│  李小華  06/10–06/15  6天  20:00:07     │
│  ...                                    │
└─────────────────────────────────────────┘
```

---

## Build Sequence

### Phase 1: Google Sheet + GAS Backend
1. Create Google Sheet with 3 tabs (Bookings, Staff, Settings)
2. Populate Staff tab with test names
3. Set default values in Settings tab
4. Write GAS `doGet` handlers (getStatus, getBookings, getStaff, getSettings, getCalendarData)
5. Write GAS `doPost` handler (submitBooking with full validation)
6. Deploy as web app (Anyone can access)
7. Test with curl / browser

### Phase 2: HTML Frontend — Core
1. Status bar with gate open/closed + countdown
2. Calendar grid rendering (6 months)
3. Date range selection (click start + click end)
4. Booking panel with validation
5. Wire to GAS endpoints

### Phase 3: HTML Frontend — Polish
1. Public log table with auto-refresh
2. "My bookings" summary section
3. Confirmation dialog before submit
4. Mobile-responsive layout
5. Loading states and error handling

### Phase 4: Testing
1. Test with gate closed → verify all submissions rejected
2. Test with gate open → verify booking flow
3. Test edge cases:
   - Book exactly 4 days / exactly 7 days
   - Try to book 3 days (should reject)
   - Try to exceed 14-day cap
   - Try to book a day that already has 2 people
   - Two people submit overlapping ranges simultaneously
4. Test with the actual Google Sheet — verify data appears correctly

---

## Key Lessons from UD System (Apply Here)

1. **Always use the correct column name** — verify Sheet headers before writing GAS code. The UD bug was caused by reading `UID` when the column was `UID2`.
2. **GAS `updateMap` needs empty-value guards** — never let an empty string become a wildcard key.
3. **Test with a COPY of the Sheet** — never test against production data.
4. **`normalizeData` must match actual Sheet structure** — column names in frontend must exactly match Sheet headers.
5. **Server-side validation is the source of truth** — frontend validation is for UX only; GAS must enforce all rules independently.

---

## Files to Deliver

1. `VACATION_SYSTEM_PLAN.md` — this file
2. `vacation_booking.html` — single HTML file (React + Babel + Tailwind)
3. `gas_code.js` — Google Apps Script code (paste into Sheet's script editor)
4. `README.md` — setup instructions (create Sheet, paste GAS, deploy, open HTML)

---

## Open Questions / Future Enhancements

- **Cooldown between submissions:** Prevent rapid-fire block submissions (e.g., 5-min wait). Deferred for now.
- **Round history:** View past rounds' bookings. Currently only shows current round.
- **Notifications:** Line/email alert when gate opens. Out of scope for demo.
- **Admin override:** Allow supervisor to manually add/remove bookings. Not in v1.
- **Holiday awareness:** Auto-block national holidays or mark them specially. Future feature.
