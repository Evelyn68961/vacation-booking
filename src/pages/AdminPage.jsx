import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fmtTaipeiDateTime } from '../lib/dateUtils.js'

// datetime-local input strings ("YYYY-MM-DDTHH:mm") are interpreted as
// Taipei wall clock — Taipei doesn't observe DST, so UTC+8 is constant.
function taipeiLocalToISO(localStr) {
  if (!localStr) return null
  return new Date(localStr + ':00+08:00').toISOString()
}

function isoToTaipeiLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function taipeiDateStr(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function addMonthsToDateStr(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  return (
    dt.getFullYear() +
    '-' +
    String(dt.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getDate()).padStart(2, '0')
  )
}

// Snap forward to the next Sunday on or after dateStr. Matches the DB helper
// public.next_sunday_on_or_after so the admin's auto-filled range_to mirrors
// what the natural gate would produce.
function nextSundayOnOrAfter(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const offset = (7 - dt.getDay()) % 7
  dt.setDate(dt.getDate() + offset)
  return (
    dt.getFullYear() +
    '-' +
    String(dt.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getDate()).padStart(2, '0')
  )
}

export default function AdminPage({ staff }) {
  const [gateInfo, setGateInfo] = useState(null)
  const [override, setOverride] = useState({ time: '', from: '', to: '', round: '' })
  const [form, setForm] = useState({ time: '', from: '', to: '', round: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const [{ data: gate }, { data: rows }] = await Promise.all([
      supabase.rpc('get_gate_info'),
      supabase
        .from('settings')
        .select('key, value')
        .in('key', [
          'gate_override_time',
          'gate_override_range_from',
          'gate_override_range_to',
          'gate_override_round',
        ]),
    ])
    setGateInfo(gate)
    const map = Object.fromEntries((rows || []).map((r) => [r.key, r.value]))
    const ov = {
      time: map.gate_override_time || '',
      from: map.gate_override_range_from || '',
      to: map.gate_override_range_to || '',
      round: map.gate_override_round || '',
    }
    setOverride(ov)
    setForm({
      time: ov.time ? isoToTaipeiLocal(ov.time) : '',
      from: ov.from || '',
      to: ov.to || '',
      round: ov.round || '',
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // When admin picks a gate time, auto-fill range + round if empty.
  const handleTimeChange = (localStr) => {
    const next = { ...form, time: localStr }
    if (localStr) {
      const iso = taipeiLocalToISO(localStr)
      const dateStr = taipeiDateStr(iso)
      if (!form.from) next.from = dateStr
      if (!form.to) next.to = nextSundayOnOrAfter(addMonthsToDateStr(dateStr, 6))
      if (!form.round) next.round = dateStr.slice(0, 7)
    }
    setForm(next)
  }

  const handleSave = async () => {
    if (!form.time) {
      setToast({ type: 'error', msg: '請選擇開放時間' })
      return
    }
    if (!form.from || !form.to) {
      setToast({ type: 'error', msg: '請選擇預約日期範圍' })
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('set_gate_override', {
      p_gate_time: taipeiLocalToISO(form.time),
      p_range_from: form.from,
      p_range_to: form.to,
      p_round: form.round || null,
    })
    setSaving(false)
    if (error) {
      setToast({ type: 'error', msg: '網路錯誤：' + error.message })
      return
    }
    if (data?.success) {
      setToast({ type: 'success', msg: '已套用自訂開放時間' })
      loadAll()
    } else {
      setToast({ type: 'error', msg: data?.error || '儲存失敗' })
    }
  }

  const handleClear = async () => {
    if (!confirm('確定要清除自訂設定，恢復每月第一個週六的預設排程？')) return
    setSaving(true)
    const { data, error } = await supabase.rpc('clear_gate_override')
    setSaving(false)
    if (error) {
      setToast({ type: 'error', msg: '網路錯誤：' + error.message })
      return
    }
    if (data?.success) {
      setToast({ type: 'success', msg: '已恢復預設排程' })
      loadAll()
    } else {
      setToast({ type: 'error', msg: data?.error || '清除失敗' })
    }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-secondary)' }}>
        載入中...
      </div>
    )
  }

  const overrideSet = !!override.time
  const overrideActive = gateInfo?.override === true
  const overrideExpired = overrideSet && !overrideActive

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 12px 60px' }}>
      {toast && (
        <div className={`toast toast-${toast.type} fade-in`}>
          {toast.type === 'success' ? '✓ ' : '✗ '}
          {toast.msg}
        </div>
      )}

      <div
        className="card p-4 mb-4"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>管理後台</h1>
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginTop: 4 }}>
            {staff.name} ({staff.work_id})
          </div>
        </div>
        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
          ← 返回預約頁
        </Link>
      </div>

      <div className="card p-4 mb-4">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>目前生效狀態</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 16, fontSize: 14 }}>
          <span style={{ color: 'var(--c-text-secondary)' }}>模式</span>
          <strong style={{ color: overrideActive ? 'var(--c-amber)' : 'var(--c-text)' }}>
            {overrideActive ? '自訂開放時間' : '預設（每月第一個週六 20:00）'}
          </strong>
          <span style={{ color: 'var(--c-text-secondary)' }}>狀態</span>
          <strong>{gateInfo?.gate_open ? '已開放' : '未開放'}</strong>
          <span style={{ color: 'var(--c-text-secondary)' }}>開放時間</span>
          <strong>{fmtTaipeiDateTime(gateInfo?.gate_time)}</strong>
          <span style={{ color: 'var(--c-text-secondary)' }}>輪次</span>
          <strong>{gateInfo?.current_round}</strong>
          <span style={{ color: 'var(--c-text-secondary)' }}>可預約範圍</span>
          <strong>
            {gateInfo?.range_from} ~ {gateInfo?.range_to}
          </strong>
        </div>
      </div>

      {overrideExpired && (
        <div className="conn-banner" style={{ background: '#FEF3C7', color: '#92400E' }}>
          ⚠️ 之前設定的自訂時間已過期，系統已自動恢復預設排程。若不再需要，可按下「清除自訂設定」整理紀錄。
        </div>
      )}

      <div className="card p-4 mb-4">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>設定自訂開放時間</h2>
        <p style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginBottom: 16 }}>
          指定某個日期與時間讓員工可以開始預假。儲存後立即生效，並在「下個月第一個週六 20:00」到達時自動失效，恢復預設排程。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            開放時間（台北時間）
            <input
              type="datetime-local"
              className="input"
              value={form.time}
              onChange={(e) => handleTimeChange(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600 }}>
            可預約起始日
            <input
              type="date"
              className="input"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              style={{ marginTop: 4 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600 }}>
            可預約結束日
            <input
              type="date"
              className="input"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              style={{ marginTop: 4 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600 }}>
            輪次名稱（預設為 YYYY-MM）
            <input
              type="text"
              className="input"
              value={form.round}
              onChange={(e) => setForm({ ...form, round: e.target.value })}
              placeholder="例: 2026-05 或 TEST"
              style={{ marginTop: 4 }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '儲存並套用'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleClear}
            disabled={saving || !overrideSet}
          >
            清除自訂設定
          </button>
        </div>
      </div>
    </div>
  )
}
