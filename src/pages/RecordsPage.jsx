import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fmtTaipeiDateTime } from '../lib/dateUtils.js'

// Historical booking browser. Any registered user can view — booking rows are
// already readable via RLS (same data shown in PublicLog for the current round).
export default function RecordsPage({ staff }) {
  const [rounds, setRounds] = useState([])
  const [selectedRound, setSelectedRound] = useState('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('bookings')
      .select('round')
      .then(({ data, error: err }) => {
        if (err) return
        const uniq = Array.from(new Set((data || []).map((r) => r.round)))
        uniq.sort().reverse()
        setRounds(uniq)
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    let q = supabase
      .from('bookings')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(1000)
    if (selectedRound !== 'all') q = q.eq('round', selectedRound)
    if (onlyMine) q = q.eq('staff_work_id', staff.work_id)
    q.then(({ data, error: err }) => {
      if (err) setError(err.message)
      else setBookings(data || [])
      setLoading(false)
    })
  }, [selectedRound, onlyMine, staff.work_id])

  const summary = useMemo(() => {
    const totalDays = bookings.reduce((sum, b) => sum + b.days, 0)
    return { count: bookings.length, totalDays }
  }, [bookings])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 60px' }}>
      <div
        className="card p-4 mb-4"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>預約紀錄</h1>
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginTop: 4 }}>
            {staff.name} ({staff.work_id})
          </div>
        </div>
        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
          ← 返回預約頁
        </Link>
      </div>

      <div className="card p-4 mb-4">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            輪次
            <select
              className="input"
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              style={{ maxWidth: 180, padding: '6px 10px' }}
            >
              <option value="all">全部</option>
              {rounds.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            僅顯示我的
          </label>

          <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--c-text-secondary)' }}>
            共 <strong style={{ color: 'var(--c-text)' }}>{summary.count}</strong> 筆，總計{' '}
            <strong style={{ color: 'var(--c-text)' }}>{summary.totalDays}</strong> 天
          </div>
        </div>

        {error && (
          <div className="conn-banner" style={{ background: '#FEE2E2', color: '#991B1B' }}>
            無法載入紀錄：{error}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', padding: 24, textAlign: 'center' }}>
            載入中...
          </div>
        ) : bookings.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', padding: 24, textAlign: 'center' }}>
            尚無紀錄
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--c-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>輪次</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>姓名</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>員編</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>日期區間</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600 }}>天數</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>提交時間</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const isMine = b.staff_work_id === staff.work_id
                  return (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: '1px solid var(--c-border)',
                        background: isMine ? 'var(--c-selected)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{b.round}</td>
                      <td style={{ padding: '8px 12px' }}>{b.name}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                        {b.staff_work_id}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {b.start_date} ~ {b.end_date}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.days}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtTaipeiDateTime(b.submitted_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
