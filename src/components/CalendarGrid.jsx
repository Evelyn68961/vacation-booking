import { useMemo } from 'react'
import { parseDate } from '../lib/dateUtils.js'
import MiniCalendar from './MiniCalendar.jsx'

const MAX_PER_DAY_DEFAULT = 2

export default function CalendarGrid({
  countByDate,
  selectedDates,
  bookableFrom,
  bookableTo,
  onDayClick,
  maxPerDay = MAX_PER_DAY_DEFAULT,
}) {
  const months = useMemo(() => {
    if (!bookableFrom) return []
    const start = parseDate(bookableFrom)
    const result = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      result.push({ year: d.getFullYear(), month: d.getMonth() })
    }
    return result
  }, [bookableFrom])

  return (
    <div className="card p-4 mb-4 fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>選擇日期</h2>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <Legend color="#DCFCE7" border="#BBF7D0" label="可預約" />
          <Legend color="#FEF3C7" border="#FDE68A" label={`剩 1 位`} />
          <Legend color="#FEE2E2" border="#FECACA" label="已滿" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {months.map((m) => (
          <MiniCalendar
            key={`${m.year}-${m.month}`}
            year={m.year}
            month={m.month}
            countByDate={countByDate}
            selectedDates={selectedDates}
            bookableFrom={bookableFrom}
            bookableTo={bookableTo}
            onDayClick={onDayClick}
            maxPerDay={maxPerDay}
          />
        ))}
      </div>
    </div>
  )
}

function Legend({ color, border, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${border}` }} />
      {label}
    </span>
  )
}
