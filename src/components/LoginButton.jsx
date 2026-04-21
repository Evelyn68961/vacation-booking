export default function LoginButton({ onSignIn }) {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
      <div className="card p-6" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>預假系統</h1>
        <p style={{ color: 'var(--c-text-secondary)', fontSize: 14, marginBottom: 20 }}>
          請使用 Google 帳號登入
        </p>
        <button className="btn-primary" onClick={onSignIn}>
          使用 Google 登入
        </button>
      </div>
    </div>
  )
}
