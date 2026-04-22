import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { msUntil, splitDuration } from '../lib/dateUtils.js'

function useCountdown(targetIso) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!targetIso) return
    const tick = () => {
      const ms = msUntil(targetIso)
      if (ms <= 0) {
        setLabel('已開放')
        return
      }
      const { d, h, m, s } = splitDuration(ms)
      setLabel(`${d}天 ${h}時 ${m}分 ${s}秒`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])
  return label
}

export default function StatusBar({ gateInfo, loading, staff, onSignOut }) {
  const countdown = useCountdown(gateInfo?.gate_time)

  if (loading || !gateInfo) {
    return (
      <div className="card p-4 mb-4">
        <div className="skeleton" style={{ height: 24, width: 200, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 300 }} />
      </div>
    )
  }

  const open = gateInfo.gate_open
  const round = gateInfo.current_round
  const rangeFrom = gateInfo.range_from
  const rangeTo = gateInfo.range_to

  return (
    <div className="card p-4 mb-4 fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>預假系統</h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            borderRadius: 20,
            background: open ? '#DCFCE7' : '#FEE2E2',
            fontSize: 13, fontWeight: 600,
          }}>
            <span className={`status-dot ${open ? 'status-open' : 'status-closed'}`} />
            {open ? '已開放' : '未開放'}
          </div>
          <span style={{ fontSize: 13, color: 'var(--c-text-secondary)', fontWeight: 500 }}>
            {round} 輪
          </span>
        </div>
        {staff && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>
              {staff.name} ({staff.work_id})
            </span>
            {staff.is_admin && (
              <Link
                to="/admin"
                className="btn-secondary"
                style={{ padding: '4px 12px', fontSize: 13, textDecoration: 'none' }}
              >
                管理
              </Link>
            )}
            <button className="btn-secondary" onClick={onSignOut} style={{ padding: '4px 12px', fontSize: 13 }}>
              登出
            </button>
          </div>
        )}
      </div>
      {!open && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--c-text-secondary)' }}>
          ⏳ 距離開放: <strong style={{ color: 'var(--c-text)' }}>{countdown}</strong>
        </div>
      )}
      {rangeFrom && rangeTo && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--c-text-secondary)' }}>
          可預約範圍: <strong>{rangeFrom}</strong> ~ <strong>{rangeTo}</strong>
        </div>
      )}
    </div>
  )
}
