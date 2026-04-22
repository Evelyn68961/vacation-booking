import { fmtTaipeiTime } from '../lib/dateUtils.js'
import { useIsMobile } from '../hooks/useMediaQuery.js'

export default function PublicLog({ bookings, status, onRefresh }) {
  const isMobile = useIsMobile()

  return (
    <div className="card p-4 mb-4 fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>公開紀錄</h2>
        <button
          onClick={onRefresh}
          className="btn-secondary"
          style={{ padding: '4px 12px', fontSize: 13, borderRadius: 6 }}
        >
          🔄 重新整理
        </button>
      </div>

      {status === 'reconnecting' && (
        <div className="conn-banner">即時更新已中斷，正在重連…</div>
      )}
      {status === 'error' && (
        <div className="conn-banner" style={{ background: '#FEE2E2', color: '#991B1B' }}>
          無法載入紀錄，請點選「重新整理」。
        </div>
      )}

      {bookings.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', padding: 16, textAlign: 'center' }}>
          本輪尚無預約紀錄
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bookings.map((b) => (
            <div
              key={b.id}
              style={{
                border: '1px solid var(--c-border)',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
              }}>
                <strong style={{ fontSize: 14 }}>{b.name}</strong>
                <span style={{ color: 'var(--c-text-secondary)' }}>{b.days} 天</span>
              </div>
              <div style={{ marginTop: 4, whiteSpace: 'nowrap' }}>
                {b.start_date} ~ {b.end_date}
              </div>
              <div style={{
                marginTop: 4, color: 'var(--c-text-secondary)',
                fontFamily: 'monospace', fontSize: 12,
              }}>
                {fmtTaipeiTime(b.submitted_at)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--c-border)' }}>
                <th style={{ textAlign: 'left',   padding: '8px 12px', fontWeight: 600 }}>姓名</th>
                <th style={{ textAlign: 'left',   padding: '8px 12px', fontWeight: 600 }}>日期區間</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600 }}>天數</th>
                <th style={{ textAlign: 'left',   padding: '8px 12px', fontWeight: 600 }}>提交時間</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '8px 12px' }}>{b.name}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{b.start_date} ~ {b.end_date}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.days}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                    {fmtTaipeiTime(b.submitted_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
