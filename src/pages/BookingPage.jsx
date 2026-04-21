import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  daysBetween,
  expandRange,
  parseDate,
  sameDay,
} from '../lib/dateUtils.js'
import { useAnnualPoints } from '../hooks/useAnnualPoints.js'
import { useBookings } from '../hooks/useBookings.js'
import { useCalendarData } from '../hooks/useCalendarData.js'
import { useGateInfo } from '../hooks/useGateInfo.js'
import { useSettings } from '../hooks/useSettings.js'
import StatusBar from '../components/StatusBar.jsx'
import CalendarGrid from '../components/CalendarGrid.jsx'
import BookingPanel from '../components/BookingPanel.jsx'
import MyBookings from '../components/MyBookings.jsx'
import PublicLog from '../components/PublicLog.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function BookingPage({ staff, onSignOut }) {
  const { gateInfo, loading: gateLoading } = useGateInfo()
  const { settings } = useSettings()
  const currentRound = gateInfo?.current_round
  const { bookings, status: rtStatus, refresh } = useBookings(currentRound)
  const { countByDate } = useCalendarData(bookings)
  const { used: annualUsed, year: annualYear, refresh: refreshAnnual } =
    useAnnualPoints(staff.work_id)

  const [selStart, setSelStart] = useState(null)
  const [selEnd, setSelEnd] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const selectedDates = useMemo(() => {
    const s = new Set()
    if (selStart && selEnd) {
      expandRange(selStart, selEnd).forEach((d) => s.add(d))
    } else if (selStart) {
      s.add(selStart)
    }
    return s
  }, [selStart, selEnd])

  const selDays = selStart && selEnd
    ? daysBetween(parseDate(selStart), parseDate(selEnd))
    : 0

  const personUsed = useMemo(
    () =>
      bookings
        .filter((b) => b.staff_work_id === staff.work_id)
        .reduce((sum, b) => sum + b.days, 0),
    [bookings, staff.work_id],
  )

  const handleDayClick = useCallback(
    (dateStr) => {
      if (!selStart || selEnd) {
        setSelStart(dateStr)
        setSelEnd(null)
        return
      }
      const s = parseDate(selStart)
      const e = parseDate(dateStr)
      if (e < s) {
        setSelStart(dateStr)
        setSelEnd(null)
      } else if (sameDay(s, e)) {
        setSelStart(null)
        setSelEnd(null)
      } else {
        setSelEnd(dateStr)
      }
    },
    [selStart, selEnd],
  )

  const handleConfirm = async () => {
    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_booking', {
      p_start: selStart,
      p_end: selEnd,
    })
    setSubmitting(false)
    setShowConfirm(false)

    if (error) {
      setToast({ type: 'error', msg: '網路錯誤：' + error.message })
      return
    }
    if (data?.success) {
      setToast({ type: 'success', msg: '預約成功！' })
      setSelStart(null)
      setSelEnd(null)
      // Realtime will push our own INSERT back within ~100ms, but nudge a
      // refresh in case the subscription is mid-reconnect.
      refresh()
      refreshAnnual()
    } else {
      let msg = data?.error || '預約失敗'
      const blocked = data?.details?.blocked_dates
      if (blocked?.length) msg += `: ${blocked.join(', ')}`
      setToast({ type: 'error', msg })
    }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px 60px' }}>
      {toast && (
        <div className={`toast toast-${toast.type} fade-in`}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      <StatusBar
        gateInfo={gateInfo}
        loading={gateLoading}
        staff={staff}
        onSignOut={onSignOut}
      />

      <CalendarGrid
        countByDate={countByDate}
        selectedDates={selectedDates}
        bookableFrom={gateInfo?.range_from}
        bookableTo={gateInfo?.range_to}
        onDayClick={handleDayClick}
        maxPerDay={settings.maxPerDay}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <BookingPanel
          staff={staff}
          selStart={selStart}
          selEnd={selEnd}
          selDays={selDays}
          settings={settings}
          personUsed={personUsed}
          countByDate={countByDate}
          gateOpen={!!gateInfo?.gate_open}
          annualUsed={annualUsed}
          annualBudget={settings.annualPointsPerPerson}
          annualYear={annualYear}
          onSubmit={() => setShowConfirm(true)}
          submitting={submitting}
        />
        <MyBookings
          bookings={bookings}
          staff={staff}
          maxPerPerson={settings.maxPerPerson}
          annualUsed={annualUsed}
          annualBudget={settings.annualPointsPerPerson}
          year={annualYear}
        />
      </div>

      <PublicLog bookings={bookings} status={rtStatus} onRefresh={refresh} />

      {showConfirm && (
        <ConfirmDialog
          name={staff.name}
          start={selStart}
          end={selEnd}
          days={selDays}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}
