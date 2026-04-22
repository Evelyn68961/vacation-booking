import { Link } from 'react-router-dom'

// Static help / usage guide. Plain-text cards, no data fetching.
// Admin edits live rule values in the `settings` table — the numbers quoted
// here are the defaults; if an admin changes them, update the text too.
export default function HelpPage({ staff }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px 60px' }}>
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>使用說明</h1>
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginTop: 4 }}>
            {staff.name} ({staff.work_id})
          </div>
        </div>
        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
          ← 返回預約頁
        </Link>
      </div>

      <Section title="⏰ 開放時間">
        <p>系統每月<strong>第一個週六 20:00</strong>自動開放下一輪預約。</p>
        <p style={{ marginTop: 6 }}>
          開放後可預約的範圍：<strong>開放日</strong>起算約半年，延後到下一個週日。
        </p>
        <p style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginTop: 6 }}>
          例如：
          <span style={{ whiteSpace: 'nowrap' }}>2026-05-02（六）20:00 開放</span>
          {' → '}
          <span style={{ whiteSpace: 'nowrap' }}>可預約至 2026-11-08（日）。</span>
        </p>
      </Section>

      <Section title="📅 如何預約">
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>在日曆上點選 <strong>開始日期</strong>。</li>
          <li>再點選 <strong>結束日期</strong>，區間會自動填上。</li>
          <li>檢查右側「預約」卡片：天數、年度點數、個人總額都要是綠勾。</li>
          <li>按 <strong>送出預約</strong>，在彈窗中再次確認即可。</li>
        </ol>
        <p style={{ marginTop: 8, color: 'var(--c-red)', fontWeight: 600 }}>
          ⚠️ 送出後無法取消，請先確認日期。
        </p>
      </Section>

      <Section title="📏 預約規則">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>每次預約需為 <strong>連續 4–7 天</strong>。</li>
          <li>每輪每人最多 <strong>14 天</strong>（多筆預約加總）。</li>
          <li>每人每年有 <strong>12 點</strong>，一筆預約 = 1 點，依「開始日期」所屬年度計算。</li>
          <li>每天同時最多 <strong>2 人</strong> 休假；滿了就無法選擇。</li>
          <li>先送先贏，送出時間以伺服器為準。</li>
        </ul>
      </Section>

      <Section title="🎨 日曆顏色">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 12, fontSize: 14 }}>
          <Swatch color="#DCFCE7" border="#BBF7D0" />
          <span>可預約（當天還有空位）</span>
          <Swatch color="#FEF3C7" border="#FDE68A" />
          <span>剩 1 位（謹慎選擇）</span>
          <Swatch color="#FEE2E2" border="#FECACA" />
          <span>已滿（無法點選）</span>
          <Swatch color="#F3F4F6" border="#E5E7EB" />
          <span>不在可預約範圍內</span>
        </div>
      </Section>

      <Section title="📊 其他頁面">
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li><strong>紀錄</strong>：查看歷史輪次所有人的預約紀錄，可篩選輪次或只看自己。</li>
          <li><strong>管理</strong>（僅管理員）：調整開放時間、範圍、測試模式。</li>
        </ul>
      </Section>

      <Section title="❓ 遇到問題">
        <p>
          如果看到錯誤訊息、預約送不出去、或點數顯示怪怪的，請聯絡管理員協助處理。
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card p-4 mb-4">
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function Swatch({ color, border }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        background: color,
        border: `1px solid ${border}`,
        display: 'inline-block',
      }}
    />
  )
}
