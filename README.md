# 預假系統 — 設定說明

## 快速設定 (3 步驟)

### Step 1: 建立 Google Sheet

1. 開新的 Google Sheet
2. 建立 3 個分頁 (tab)，名稱必須完全一致：

**分頁「Bookings」** — 第一列標題：
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| 姓名 | 開始日期 | 結束日期 | 天數 | 提交時間 | 輪次 |

**分頁「Staff」** — 第一列標題 + 人員名單：
| A |
|---|
| 姓名 |
| 王小明 |
| 李小華 |
| 張大衛 |
| ... |

**分頁「Settings」** — 第一列標題 + 預設值：
| A | B |
|---|---|
| 設定項 | 值 |
| 每日上限 | 2 |
| 每人上限 | 14 |
| 最少天數 | 4 |
| 最多天數 | 7 |

### Step 2: 部署 Google Apps Script

1. 在 Google Sheet 上方選單 → **擴充功能** → **Apps Script**
2. 刪除預設的 `function myFunction()` 程式碼
3. 將 `gas_code.js` 的全部內容貼上
4. 點擊上方 **部署** → **新增部署作業**
5. 類型選 **網頁應用程式**
6. 執行身分: **我 (你的帳號)**
7. 誰可以存取: **所有人**
8. 點 **部署**，複製產生的網址 (以 `/exec` 結尾)

### Step 3: 設定前端

1. 打開 `vacation_booking.html`
2. 找到這一行 (約第 87 行)：
   ```
   const GAS_URL = '';
   ```
3. 把剛才複製的 GAS 網址貼進去：
   ```
   const GAS_URL = 'https://script.google.com/macros/s/AKfycbx2F6_qYK2EkiLSL5CKsDgSq5ONBxMv6rhesg6MpTIB0NsOweUuIjh5T77hL_4w8OvK/exec';
   ```
4. 存檔，用瀏覽器打開 HTML 檔案即可使用

---

## 測試建議

- **先用 Sheet 副本測試**，不要直接用正式資料
- 測試時可以暫時修改 GAS 的 `getGateInfo()` 讓 gate 立刻開放：
  ```javascript
  // 在 getGateInfo() 開頭加這行 (測試完記得刪除)
  return { gateOpen: true, gateTime: new Date().toISOString(), currentRound: '2026-05', bookableRange: { from: '2026-05-01', to: '2026-11-01' } };
  ```

## 注意事項

- 所有時間判斷以 GAS 伺服器時間為準 (不依賴使用者電腦時間)
- 預約一旦送出即無法取消 (by design)
- Settings 分頁可隨時調整規則，立即生效
- 每次修改 GAS 程式碼後需要重新部署 (部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署)
