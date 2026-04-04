// ============================================================
// 預假系統 — Google Apps Script Backend
// Paste this entire file into your Google Sheet's Script Editor
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// --- Sheet references ---
function getBookingsSheet() { return SS.getSheetByName('Bookings'); }
function getStaffSheet()    { return SS.getSheetByName('Staff'); }
function getSettingsSheet() { return SS.getSheetByName('Settings'); }

// --- Settings reader ---
function getSettings() {
  const sheet = getSettingsSheet();
  const data = sheet.getDataRange().getValues();
  const settings = {};
  // Settings tab: Column A = key name, Column B = value
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    const val = data[i][1];
    if (key) settings[key] = val;
  }
  return {
    maxPerDay:       Number(settings['每日上限']) || 2,
    maxPerPerson:    Number(settings['每人上限']) || 14,
    minConsecutive:  Number(settings['最少天數']) || 4,
    maxConsecutive:  Number(settings['最多天數']) || 7
  };
}

// --- Gate time calculation (fully automatic) ---
function getGateInfo() {
  const now = new Date();

  // Find first Saturday of current month at 20:00
  let gate = new Date(now.getFullYear(), now.getMonth(), 1);
  while (gate.getDay() !== 6) gate.setDate(gate.getDate() + 1);
  gate.setHours(20, 0, 0, 0);

  // If already passed, find first Saturday of next month
  if (now > gate) {
    gate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    while (gate.getDay() !== 6) gate.setDate(gate.getDate() + 1);
    gate.setHours(20, 0, 0, 0);
  }

  // Bookable range: gate date → 6 months ahead
  const rangeFrom = new Date(gate.getFullYear(), gate.getMonth(), gate.getDate());
  const rangeTo = new Date(gate.getFullYear(), gate.getMonth() + 6, gate.getDate());

  // Round ID
  const round = gate.getFullYear() + '-' + String(gate.getMonth() + 1).padStart(2, '0');

  return {
    gateOpen: now >= gate,
    gateTime: gate.toISOString(),
    currentRound: round,
    bookableRange: {
      from: formatDate(rangeFrom),
      to: formatDate(rangeTo)
    }
  };
}

// --- Helpers ---
function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseDate(str) {
  const parts = String(str).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function daysBetween(start, end) {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000) + 1; // inclusive
}

// Expand a date range into an array of YYYY-MM-DD strings
function expandRange(startStr, endStr) {
  const dates = [];
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// --- Read bookings for a specific round ---
function getBookingsForRound(round) {
  const sheet = getBookingsSheet();
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[5]).trim() === round) {
      bookings.push({
        name:      String(row[0]).trim(),
        startDate: formatDate(new Date(row[1])),
        endDate:   formatDate(new Date(row[2])),
        days:      Number(row[3]),
        timestamp: row[4] ? new Date(row[4]).toISOString() : '',
        round:     String(row[5]).trim()
      });
    }
  }
  return bookings;
}

// --- Calendar data: count bookings per day for current round ---
function buildCalendarData(round) {
  const bookings = getBookingsForRound(round);
  const counts = {};
  bookings.forEach(function(b) {
    const dates = expandRange(b.startDate, b.endDate);
    dates.forEach(function(d) {
      counts[d] = (counts[d] || 0) + 1;
    });
  });
  return counts;
}

// --- Count a person's total booked days in a round ---
function countPersonDays(name, round) {
  const bookings = getBookingsForRound(round);
  let total = 0;
  bookings.forEach(function(b) {
    if (b.name === name) total += b.days;
  });
  return total;
}

// ============================================================
// doGet — read-only actions
// ============================================================
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  let result;

  try {
    switch (action) {
      case 'getStatus':
        result = getGateInfo();
        break;

      case 'getBookings': {
        const info = getGateInfo();
        result = getBookingsForRound(info.currentRound);
        break;
      }

      case 'getStaff': {
        const sheet = getStaffSheet();
        const data = sheet.getDataRange().getValues();
        const names = [];
        for (let i = 1; i < data.length; i++) {
          const n = String(data[i][0]).trim();
          if (n) names.push(n);
        }
        result = names;
        break;
      }

      case 'getSettings':
        result = getSettings();
        break;

      case 'getCalendarData': {
        const info = getGateInfo();
        result = buildCalendarData(info.currentRound);
        break;
      }

      case 'getAll': {
        // Single call to fetch everything the frontend needs
        const info = getGateInfo();
        const staffSheet = getStaffSheet();
        const staffData = staffSheet.getDataRange().getValues();
        const names = [];
        for (let i = 1; i < staffData.length; i++) {
          const n = String(staffData[i][0]).trim();
          if (n) names.push(n);
        }
        result = {
          status: info,
          bookings: getBookingsForRound(info.currentRound),
          staff: names,
          settings: getSettings(),
          calendarData: buildCalendarData(info.currentRound)
        };
        break;
      }

      default:
        result = { error: '未知的 action 參數: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — booking submission
// ============================================================
function doPost(e) {
  let result;
  const lock = LockService.getScriptLock();

  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action !== 'submitBooking') {
      return jsonResponse({ error: '未知的 action: ' + action });
    }

    const name = String(body.name || '').trim();
    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();

    // --- Basic validation ---
    if (!name || !startDate || !endDate) {
      return jsonResponse({ error: '缺少必填欄位 (姓名、開始日期、結束日期)' });
    }

    const settings = getSettings();
    const gateInfo = getGateInfo();

    // 1. Gate open?
    if (!gateInfo.gateOpen) {
      return jsonResponse({ error: '預約尚未開放，開放時間: ' + gateInfo.gateTime });
    }

    // 2. Parse dates & day count
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return jsonResponse({ error: '日期格式錯誤' });
    }
    if (end < start) {
      return jsonResponse({ error: '結束日期不能早於開始日期' });
    }
    const numDays = daysBetween(start, end);

    // 3. Consecutive days check
    if (numDays < settings.minConsecutive) {
      return jsonResponse({ error: '最少需連續 ' + settings.minConsecutive + ' 天，目前選取 ' + numDays + ' 天' });
    }
    if (numDays > settings.maxConsecutive) {
      return jsonResponse({ error: '最多連續 ' + settings.maxConsecutive + ' 天，目前選取 ' + numDays + ' 天' });
    }

    // 4. Within bookable range?
    const rangeFrom = parseDate(gateInfo.bookableRange.from);
    const rangeTo = parseDate(gateInfo.bookableRange.to);
    if (start < rangeFrom || end > rangeTo) {
      return jsonResponse({ error: '選取日期超出可預約範圍 (' + gateInfo.bookableRange.from + ' ~ ' + gateInfo.bookableRange.to + ')' });
    }

    // 5. Verify staff name exists
    const staffSheet = getStaffSheet();
    const staffData = staffSheet.getDataRange().getValues();
    const staffNames = [];
    for (let i = 1; i < staffData.length; i++) {
      const n = String(staffData[i][0]).trim();
      if (n) staffNames.push(n);
    }
    if (staffNames.indexOf(name) === -1) {
      return jsonResponse({ error: '找不到此人員: ' + name });
    }

    // --- Acquire lock for atomic check-and-write ---
    lock.waitLock(10000); // wait up to 10 seconds

    // 6. Personal cap check
    const existingDays = countPersonDays(name, gateInfo.currentRound);
    if (existingDays + numDays > settings.maxPerPerson) {
      lock.releaseLock();
      return jsonResponse({
        error: '超過個人上限。已預約 ' + existingDays + ' 天，本次 ' + numDays + ' 天，上限 ' + settings.maxPerPerson + ' 天'
      });
    }

    // 7. Per-day capacity check
    const calData = buildCalendarData(gateInfo.currentRound);
    const requestedDates = expandRange(startDate, endDate);
    const fullDays = [];
    requestedDates.forEach(function(d) {
      if ((calData[d] || 0) >= settings.maxPerDay) {
        fullDays.push(d);
      }
    });
    if (fullDays.length > 0) {
      lock.releaseLock();
      return jsonResponse({
        error: '以下日期已額滿 (上限 ' + settings.maxPerDay + ' 人/天): ' + fullDays.join(', ')
      });
    }

    // 8. All checks pass — write to Sheet
    const timestamp = new Date();
    const bookingsSheet = getBookingsSheet();
    bookingsSheet.appendRow([
      name,
      start,
      end,
      numDays,
      timestamp,
      gateInfo.currentRound
    ]);

    lock.releaseLock();

    result = {
      success: true,
      message: '預約成功！',
      booking: {
        name: name,
        startDate: startDate,
        endDate: endDate,
        days: numDays,
        timestamp: timestamp.toISOString(),
        round: gateInfo.currentRound
      }
    };

  } catch (err) {
    try { lock.releaseLock(); } catch(e2) {}
    result = { error: '伺服器錯誤: ' + err.message };
  }

  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
