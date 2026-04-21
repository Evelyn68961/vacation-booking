import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginButton from './components/LoginButton.jsx'
import BookingPage from './pages/BookingPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-text-secondary)' }}>
      載入中...
    </div>
  )
}

export default function App() {
  const { session, staff, loading, error, signIn, signOut, refreshStaff } = useAuth()

  if (loading) return <Spinner />
  if (!session) return <LoginButton onSignIn={signIn} />
  if (!staff) {
    return (
      <>
        {error && (
          <div style={{ maxWidth: 480, margin: '20px auto 0', padding: '0 12px' }}>
            <div className="conn-banner" style={{ background: '#FEE2E2', color: '#991B1B' }}>
              {error}
            </div>
          </div>
        )}
        <RegisterPage session={session} onRegistered={refreshStaff} onSignOut={signOut} />
      </>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<BookingPage staff={staff} onSignOut={signOut} />} />
      <Route
        path="/admin"
        element={staff.is_admin ? <AdminPlaceholder /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AdminPlaceholder() {
  return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: 24 }}>
      <div className="card p-6">
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>管理後台</h1>
        <p style={{ color: 'var(--c-text-secondary)', fontSize: 14 }}>
          Phase 2 功能：員工管理、設定編輯器、CSV 匯出、歷史輪次瀏覽。
        </p>
      </div>
    </div>
  )
}
