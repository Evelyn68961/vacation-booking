import { useMemo } from 'react'
import { expandRange } from '../lib/dateUtils.js'

// Pure derivation from the bookings array.
// Returns { countByDate, namesByDate } — {'YYYY-MM-DD': n} and {'YYYY-MM-DD': [names]}.
// Used by MiniCalendar to color days and show badges.
export function useCalendarData(bookings) {
  return useMemo(() => {
    const countByDate = {}
    const namesByDate = {}
    for (const b of bookings) {
      for (const d of expandRange(b.start_date, b.end_date)) {
        countByDate[d] = (countByDate[d] || 0) + 1
        if (!namesByDate[d]) namesByDate[d] = []
        namesByDate[d].push(b.name)
      }
    }
    return { countByDate, namesByDate }
  }, [bookings])
}
