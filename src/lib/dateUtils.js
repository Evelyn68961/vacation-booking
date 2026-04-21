// Date utilities for the booking calendar.
//
// Date-only values (start_date, end_date) are handled as 'YYYY-MM-DD' strings
// with local-wall-clock Date objects. No timezone math is needed for these —
// the server's get_gate_info() returns range_from/range_to already as dates
// in the Asia/Taipei calendar, and we treat them as opaque calendar days.
//
// Timestamps (submitted_at, gate_time) come back as timestamptz ISO strings.
// Those MUST be rendered through Asia/Taipei — use fmtTaipeiTime/DateTime.

const TAIPEI = 'Asia/Taipei'

// ---------- Date-only helpers ('YYYY-MM-DD' <-> Date) ----------

export function fmtDate(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000) + 1
}

export function sameDay(a, b) {
  return fmtDate(a) === fmtDate(b)
}

export function expandRange(startStr, endStr) {
  const dates = []
  const start = parseDate(startStr)
  const end = parseDate(endStr)
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(fmtDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// ---------- Taipei-anchored timestamp rendering ----------

const taipeiTimeFmt = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TAIPEI,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const taipeiDateTimeFmt = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TAIPEI,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function fmtTaipeiTime(iso) {
  if (!iso) return ''
  return taipeiTimeFmt.format(new Date(iso))
}

export function fmtTaipeiDateTime(iso) {
  if (!iso) return ''
  return taipeiDateTimeFmt.format(new Date(iso))
}

// Milliseconds until a timestamptz target. Negative if already past.
export function msUntil(iso) {
  return new Date(iso).getTime() - Date.now()
}

// Split a positive ms duration into {d, h, m, s} for countdown rendering.
export function splitDuration(ms) {
  const clamped = Math.max(0, ms)
  return {
    d: Math.floor(clamped / 86400000),
    h: Math.floor((clamped % 86400000) / 3600000),
    m: Math.floor((clamped % 3600000) / 60000),
    s: Math.floor((clamped % 60000) / 1000),
  }
}
