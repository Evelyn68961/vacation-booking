export default function ConfirmDialog({ name, start, end, days, onConfirm, onCancel, submitting }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="card p-6 fade-in"
        style={{ maxWidth: 400, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: 'var(--c-red)' }}>
          ⚠️ 確認送出
        </h3>
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          送出後<strong>無法取消</strong>，請確認以下資訊:
        </p>
        <div style={{ padding: 12, borderRadius: 8, background: '#F9FAFB', marginBottom: 16, fontSize: 14 }}>
          <div><strong>姓名:</strong> {name}</div>
          <div><strong>日期:</strong> {start} ~ {end}</div>
          <div><strong>天數:</strong> {days} 天</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? '送出中...' : '確認送出'}
          </button>
        </div>
      </div>
    </div>
  )
}
