import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Calls public.get_gate_info() RPC. Shape:
//   { gate_open, gate_time, current_round, range_from, range_to }
//
// Refetches once a minute so a client sitting on the page watches the gate
// flip open without a manual refresh. The plan calls this out as critical —
// if the server's clock says 20:00:00 but the client loaded at 19:58, we
// need the UI to update.
export function useGateInfo() {
  const [gateInfo, setGateInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  const fetchGate = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_gate_info')
    if (err) {
      setError(err.message)
    } else {
      setGateInfo(data)
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchGate()
    timerRef.current = setInterval(fetchGate, 60_000)
    return () => clearInterval(timerRef.current)
  }, [fetchGate])

  return { gateInfo, loading, error, refresh: fetchGate }
}
