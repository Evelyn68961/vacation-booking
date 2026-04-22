import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function RegisterPage({ session, onRegistered, onSignOut }) {
  const [workId, setWorkId] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!workId.trim() || !name.trim()) return
    setSubmitting(true)
    setError('')
    const { data, error: rpcErr } = await supabase.rpc('register_staff', {
      p_work_id: workId.trim(),
      p_name: name.trim(),
    })
    setSubmitting(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    if (data?.success) {
      onRegistered()
    } else {
      setError(data?.error || '註冊失敗')
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
      <div className="card p-6">
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>首次註冊</h1>
        <p style={{ color: 'var(--c-text-secondary)', fontSize: 14, marginBottom: 16 }}>
          登入 Google 帳號: <strong>{session.user.email}</strong>
          <br />
          請輸入你的員編與姓名以完成綁定。此步驟僅需一次。
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            員編
            <input
              type="text"
              className="input"
              placeholder="例: P12345"
              value={workId}
              onChange={(e) => setWorkId(e.target.value)}
              autoFocus
              style={{ maxWidth: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            姓名
            <input
              type="text"
              className="input"
              placeholder="例: 王小明"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: '100%', marginTop: 4 }}
            />
          </label>
          {error && (
            <div style={{ color: 'var(--c-red)', fontSize: 13 }}>✗ {error}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !workId.trim() || !name.trim()}
            >
              {submitting ? '送出中...' : '完成註冊'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onSignOut}
              disabled={submitting}
            >
              改用其他帳號
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
