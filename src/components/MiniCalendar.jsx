import { addDays, fmtDate, parseDate } from '../lib/dateUtils.js'

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const DAY_LABELS = ['日','一','二','三','四','五','六']

export default function MiniCalendar({
  year,
  month,
  countByDate,
  selectedDates,
  bookableFrom,
  bookableTo,
  onDayClick,
  maxPerDay,
}) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = firstDay.getDay()

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const bFrom = bookableFrom ? parseDate(bookableFrom) : null
  const bTo = bookableTo ? parseDate(bookableTo) : null

  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
        {year}年 {MONTH_NAMES[month]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DAY_LABELS.map((l) => (
          <div key={l} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', padding: '2px 0' }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, idx) => {
          if (day === null) return <div key={'b' + idx} />
          const dateObj = new Date(year, month, day)
          const dateStr = fmtDate(dateObj)
          const count = countByDate[dateStr] || 0
          const inRange = bFrom && bTo && dateObj >= bFrom && dateObj <= bTo
          const isSelected = selectedDates.has(dateStr)

          let cls = 'cal-day '
          if (!inRange) cls += 'cal-disabled'
          else if (count >= maxPerDay) cls += 'cal-full'
          else if (count === maxPerDay - 1) cls += 'cal-half'
          else cls += 'cal-available'
          if (isSelected) cls += ' cal-selected'

          if (isSelected && selectedDates.size > 1) {
            const prev = fmtDate(addDays(dateObj, -1))
            const next = fmtDate(addDays(dateObj, 1))
            const hasPrev = selectedDates.has(prev)
            const hasNext = selectedDates.has(next)
            if (hasPrev && hasNext) cls += ' cal-range-mid'
            else if (hasPrev) cls += ' cal-range-end'
            else if (hasNext) cls += ' cal-range-start'
          }

          const clickable = inRange && count < maxPerDay

          return (
            <div
              key={dateStr}
              className={cls}
              onClick={() => clickable && onDayClick(dateStr)}
            >
              {day}
              {inRange && count > 0 && <span className="badge-count">{count}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
