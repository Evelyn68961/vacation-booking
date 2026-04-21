import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Auth + staff profile. Exposes:
//   session   — Supabase session (null if logged out)
//   staff     — { work_id, name, email, is_admin } (null if logged in but unregistered)
//   loading   — true until initial session check + staff lookup finish
//   error     — message from failed staff lookup
//   signIn()  — Google OAuth redirect
//   signOut() — clear session
//   refreshStaff() — re-fetch staff row (call after register_staff succeeds)
export function useAuth() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [staffChecked, setStaffChecked] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadStaff = useCallback(async (email) => {
    setStaffChecked(false)
    setError('')
    const { data, error: err } = await supabase
      .from('staff')
      .select('work_id, name, email, is_admin, active')
      .eq('email', email)
      .maybeSingle()
    if (err) {
      setError(err.message)
      setStaff(null)
    } else if (data && data.active) {
      setStaff(data)
    } else {
      setStaff(null)
    }
    setStaffChecked(true)
  }, [])

  useEffect(() => {
    if (!sessionChecked) return
    const email = session?.user?.email
    if (!email) {
      setStaff(null)
      setStaffChecked(true)
      return
    }
    loadStaff(email)
  }, [session, sessionChecked, loadStaff])

  const signIn = useCallback(async () => {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) setError(err.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setStaff(null)
  }, [])

  const refreshStaff = useCallback(() => {
    const email = session?.user?.email
    if (email) loadStaff(email)
  }, [session, loadStaff])

  const loading = !sessionChecked || (session && !staffChecked)

  return { session, staff, loading, error, signIn, signOut, refreshStaff }
}
