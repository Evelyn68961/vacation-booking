import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fmtTaipeiDateTime } from '../lib/dateUtils.js'
import { useIsMobile } from '../hooks/useMediaQuery.js'

// CSV escape: wrap in quotes if the value contains comma / quote / newline,
// and double any embedded quotes. Plain strings pass through unwrapped.
function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  // Prepend UTF-8 BOM so Excel recognizes Chinese characters correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Historical booking browser. Any registered user can view — booking rows are
// already readable via RLS (same data shown in PublicLog for the current round).
export default function RecordsPage({ staff }) {
  const [rounds, setRounds] = useState([])
  const [selectedRound, setSelectedRound] = useState('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const isMobile = useIsMobile()

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

  const handleExport = () => {
    if (bookings.length === 0) return
    const headers = ['輪次', '員編', '姓名', '開始日期', '結束日期', '天數', '提交時間']
    const rows = bookings.map((b) => [
      b.round,
      b.staff_work_id,
      b.name,
      b.start_date,
      b.end_date,
      b.days,
      fmtTaipeiDateTime(b.submitted_at),
    ])
    const roundPart = selectedRound === 'all' ? 'all' : selectedRound
    const minePart = onlyMine ? `_${staff.work_id}` : ''
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`預約紀錄_${roundPart}${minePart}_${stamp}.csv`, headers, rows)
  }

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

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>
              共 <strong style={{ color: 'var(--c-text)' }}>{summary.count}</strong> 筆，總計{' '}
              <strong style={{ color: 'var(--c-text)' }}>{summary.totalDays}</strong> 天
            </div>
            {staff.is_admin && (
              <button
                className="btn-secondary"
                onClick={handleExport}
                disabled={bookings.length === 0}
                style={{ padding: '4px 12px', fontSize: 13 }}
              >
                匯出 CSV
              </button>
            )}
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
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map((b) => {
              const isMine = b.staff_work_id === staff.work_id
              return (
                <div
                  key={b.id}
                  style={{
                    border: '1px solid var(--c-border)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    background: isMine ? 'var(--c-selected)' : 'transparent',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
                  }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{b.name}</strong>
                      <span style={{
                        marginLeft: 6, color: 'var(--c-text-secondary)',
                        fontFamily: 'monospace', fontSize: 12,
                      }}>
                        {b.staff_work_id}
                      </span>
                    </div>
                    <span style={{ color: 'var(--c-text-secondary)' }}>{b.days} 天</span>
                  </div>
                  <div style={{ marginTop: 4, whiteSpace: 'nowrap' }}>
                    {b.start_date} ~ {b.end_date}
                  </div>
                  <div style={{
                    marginTop: 4, color: 'var(--c-text-secondary)',
                    fontFamily: 'monospace', fontSize: 12,
                    display: 'flex', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span>{b.round}</span>
                    <span>·</span>
                    <span>{fmtTaipeiDateTime(b.submitted_at)}</span>
                  </div>
                </div>
              )
            })}
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
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{b.round}</td>
                      <td style={{ padding: '8px 12px' }}>{b.name}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                        {b.staff_work_id}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {b.start_date} ~ {b.end_date}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.days}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
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
