import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const DEFAULTS = {
  maxPerDay: 2,
  maxPerPerson: 14,
  minConsecutive: 4,
  maxConsecutive: 10,
  annualPointsPerPerson: 12,
}

const KEY_MAP = {
  max_per_day: 'maxPerDay',
  max_per_person: 'maxPerPerson',
  min_consecutive: 'minConsecutive',
  max_consecutive: 'maxConsecutive',
  annual_points_per_person: 'annualPointsPerPerson',
}

// Reads the settings table, returns camelCased object.
// Falls back to defaults matching the migration's seed values.
export function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('settings').select('key, value').then(({ data, error }) => {
      if (cancelled) return
      if (!error && data) {
        const next = { ...DEFAULTS }
        for (const row of data) {
          const camel = KEY_MAP[row.key]
          if (camel) next[camel] = parseInt(row.value, 10)
        }
        setSettings(next)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { settings, loading }
}
