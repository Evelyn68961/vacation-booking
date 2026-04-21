import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Counts this user's approved bookings in the current calendar year.
// Used to display "年度點數 X / 12" and to pre-block the submit button
// when the budget is exhausted. The backend re-checks on every submit —
// this hook is for UX only.
export function useAnnualPoints(workId) {
  const year = new Date().getFullYear()
  const [used, setUsed] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!workId) return
    const { count, error } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('staff_work_id', workId)
      .eq('booking_year', year)
      .eq('approved', true)
    if (!error) setUsed(count || 0)
    setLoading(false)
  }, [workId, year])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { used, year, loading, refresh }
}
