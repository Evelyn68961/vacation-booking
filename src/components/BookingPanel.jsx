import { expandRange } from '../lib/dateUtils.js'

// Booking form panel. Identity is the logged-in staff member (no dropdown).
// Shows real-time validation and a submit button gated on all checks passing.
export default function BookingPanel({
  staff,
  selStart,
  selEnd,
  selDays,
  settings,
  personUsed,
  countByDate,
  gateOpen,
  annualUsed,
  annualBudget,
  annualYear,
  onSubmit,
  submitting,
}) {
  const minC = settings.minConsecutive
  const maxC = settings.maxConsecutive
  const maxPP = settings.maxPerPerson
  const maxPD = settings.maxPerDay

  const hasSelection = !!(selStart && selEnd)
  const lengthOk = hasSelection && selDays >= minC && selDays <= maxC
  const capOk = hasSelection && personUsed + selDays <= maxPP
  const annualOk = annualUsed < annualBudget

  let fullDays = []
  if (hasSelection) {
    fullDays = expandRange(selStart, selEnd).filter(
      (d) => (countByDate[d] || 0) >= maxPD,
    )
  }
  const availOk = fullDays.length === 0

  const canSubmit =
    gateOpen && hasSelection && lengthOk && capOk && availOk && annualOk && !submitting

  return (
    <div className="card p-4 mb-4 fade-in">
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>預約</h2>

      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--c-text-secondary)' }}>
        預約人: <strong style={{ color: 'var(--c-text)' }}>{staff.name}</strong> ({staff.work_id})
      </div>

      {hasSelection ? (
        <div style={{
          marginBottom: 12, padding: 12, borderRadius: 8,
          background: 'var(--c-selected)', border: '1px solid var(--c-selected-border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-primary)' }}>
            {selStart} ~ {selEnd}
          </div>
          <div style={{ fontSize: 13, marginTop: 4, color: 'var(--c-primary)' }}>
            共 {selDays} 天
          </div>
        </div>
      ) : (
        <div style={{
          marginBottom: 12, padding: 12, borderRadius: 8,
          background: '#F9FAFB', color: 'var(--c-text-secondary)', fontSize: 13,
        }}>
          請在上方日曆點選開始日期與結束日期
        </div>
      )}

      <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        {hasSelection && !lengthOk && (
          <div style={{ color: 'var(--c-red)' }}>
            ✗ 需連續 {minC}–{maxC} 天，目前 {selDays} 天
          </div>
        )}
        {hasSelection && lengthOk && (
          <div style={{ color: 'var(--c-green)' }}>
            ✓ {selDays} 天 (符合 {minC}–{maxC} 天規定)
          </div>
        )}
        <div style={{ color: personUsed + (selDays || 0) > maxPP ? 'var(--c-red)' : 'var(--c-text-secondary)' }}>
          已預約 {personUsed} 天{hasSelection ? ` + 本次 ${selDays} 天 = ${personUsed + selDays} 天` : ''} / 上限 {maxPP} 天
          {hasSelection && !capOk && ' ✗ 超過上限'}
        </div>
        {hasSelection && !availOk && (
          <div style={{ color: 'var(--c-red)' }}>
            ✗ 以下日期已滿: {fullDays.join(', ')}
          </div>
        )}
        {!annualOk && (
          <div style={{ color: 'var(--c-red)' }}>
            ✗ {annualYear} 年度點數已用盡 ({annualUsed}/{annualBudget})
          </div>
        )}
        {!gateOpen && (
          <div style={{ color: 'var(--c-red)' }}>✗ 預約尚未開放</div>
        )}
      </div>

      <button className="btn-primary" disabled={!canSubmit} onClick={onSubmit}>
        {submitting ? '送出中...' : '送出預約'}
      </button>
    </div>
  )
}
