export default function MyBookings({
  bookings,
  staff,
  maxPerPerson,
  annualUsed,
  annualBudget,
  year,
}) {
  const mine = bookings.filter((b) => b.staff_work_id === staff.work_id)
  const totalDays = mine.reduce((sum, b) => sum + b.days, 0)
  const annualPct = Math.min(100, (annualUsed / annualBudget) * 100)
  const roundPct = Math.min(100, (totalDays / maxPerPerson) * 100)

  return (
    <div className="card p-4 mb-4 fade-in">
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>我的預約</h2>

      <div style={{ fontSize: 14, marginBottom: 4, color: 'var(--c-text-secondary)' }}>
        年度點數 <strong style={{ color: 'var(--c-text)' }}>{annualUsed}</strong> / {annualBudget} 點 ({year})
      </div>
      <div style={{
        width: '100%', height: 6, borderRadius: 4,
        background: '#E5E7EB', overflow: 'hidden', marginBottom: 10,
      }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: annualUsed >= annualBudget ? 'var(--c-red)' : 'var(--c-primary)',
          width: annualPct + '%',
          transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ fontSize: 14, marginBottom: 4, color: 'var(--c-text-secondary)' }}>
        本輪已用 <strong style={{ color: 'var(--c-text)' }}>{totalDays}</strong> / {maxPerPerson} 天
      </div>
      <div style={{
        width: '100%', height: 6, borderRadius: 4,
        background: '#E5E7EB', overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={{
          height: '100%', borderRadius: 4,
          background: totalDays >= maxPerPerson ? 'var(--c-red)' : 'var(--c-primary)',
          width: roundPct + '%',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {mine.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>尚無預約</div>
      ) : (
        mine.map((b) => (
          <div
            key={b.id}
            style={{
              padding: '8px 12px', borderRadius: 6, background: '#F9FAFB',
              marginBottom: 4, fontSize: 13,
              display: 'flex', justifyContent: 'space-between',
            }}
          >
            <span>{b.start_date} ~ {b.end_date}</span>
            <span style={{ fontWeight: 600 }}>{b.days} 天</span>
          </div>
        ))
      )}
    </div>
  )
}
