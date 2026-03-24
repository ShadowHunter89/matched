import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  useEffect(() => {
    let mounted = true

    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        useAuthStore.setState({ initialized: true })
      }
    }, 5000)

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return
        clearTimeout(safetyTimeout)
        if (session?.user) {
          useAuthStore.setState({ user: session.user })
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .single()
            if (mounted) {
              useAuthStore.setState({ profile, initialized: true })
            }
          } catch {
            if (mounted) useAuthStore.setState({ initialized: true })
          }
        } else {
          if (mounted) useAuthStore.setState({ user: null, profile: null, initialized: true })
        }
      } catch {
        if (mounted) {
          clearTimeout(safetyTimeout)
          useAuthStore.setState({ initialized: true })
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        clearTimeout(safetyTimeout)
        if (session?.user) {
          useAuthStore.setState({ user: session.user })
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .single()
            if (mounted) {
              useAuthStore.setState({ profile, initialized: true })
            }
          } catch {
            if (mounted) useAuthStore.setState({ initialized: true })
          }
        } else {
          if (mounted) {
            useAuthStore.setState({ user: null, profile: null, initialized: true })
          }
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, []) // MUST be empty deps
}
