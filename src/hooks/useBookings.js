import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Realtime-aware bookings subscription, scoped to one round.
//
// Subscribe-then-SELECT pattern (plan §Realtime Strategy):
//   1. subscribe() first — buffer incoming INSERTs
//   2. Then SELECT the current state
//   3. Merge + dedupe by id, sort by submitted_at
//   4. Switch to live mode: append incoming INSERTs, still deduped
//
// This closes the initial-load race where a naive SELECT-then-subscribe
// drops INSERTs that land between the two calls — which is exactly what
// happens at 20:00:00 when 60 people click submit.
//
// Returns:
//   bookings      — sorted array
//   status        — 'connecting' | 'live' | 'reconnecting' | 'error'
//   refresh()     — manual re-fetch (belt-and-suspenders)
export function useBookings(currentRound) {
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('connecting')
  const stateRef = useRef({ isBuffering: true, buffer: [] })

  const mergeAndSort = useCallback((rows) => {
    const seen = new Set()
    const deduped = []
    for (const b of rows) {
      if (!seen.has(b.id)) {
        seen.add(b.id)
        deduped.push(b)
      }
    }
    deduped.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
    return deduped
  }, [])

  const loadInitial = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('round', currentRound)
      .order('submitted_at', { ascending: true })
    if (error) {
      setStatus('error')
      return
    }
    const merged = mergeAndSort([...(data || []), ...stateRef.current.buffer])
    setBookings(merged)
    stateRef.current.isBuffering = false
    stateRef.current.buffer = []
    setStatus('live')
  }, [currentRound, mergeAndSort])

  useEffect(() => {
    if (!currentRound) return
    stateRef.current = { isBuffering: true, buffer: [] }
    setStatus('connecting')

    const channel = supabase
      .channel(`bookings-${currentRound}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: `round=eq.${currentRound}`,
        },
        (payload) => {
          if (stateRef.current.isBuffering) {
            stateRef.current.buffer.push(payload.new)
          } else {
            setBookings((prev) => mergeAndSort([...prev, payload.new]))
          }
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          loadInitial()
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          setStatus('reconnecting')
        } else if (s === 'CLOSED') {
          // Only flag as reconnecting if we were previously live.
          setStatus((prev) => (prev === 'live' ? 'reconnecting' : prev))
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentRound, loadInitial, mergeAndSort])

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('round', currentRound)
      .order('submitted_at', { ascending: true })
    if (!error) setBookings(mergeAndSort(data || []))
  }, [currentRound, mergeAndSort])

  return { bookings, status, refresh }
}
