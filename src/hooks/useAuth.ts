import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// Fetch profile with a hard 4-second timeout so it never hangs
async function fetchProfileSafe(userId: string) {
  try {
    const result = await Promise.race([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 4000)
      ),
    ])
    return (result as any).data ?? null
  } catch {
    return null
  }
}

export function useAuth() {
  useEffect(() => {
    let mounted = true

    // Safety net: after 5s force-resolve no matter what
    const safetyTimeout = setTimeout(() => {
      if (mounted) useAuthStore.setState({ initialized: true })
    }, 5000)

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          useAuthStore.setState({ user: session.user })
          const profile = await fetchProfileSafe(session.user.id)
          if (mounted) useAuthStore.setState({ profile, initialized: true })
        } else {
          if (mounted) useAuthStore.setState({ user: null, profile: null, initialized: true })
        }
      } catch {
        if (mounted) useAuthStore.setState({ initialized: true })
      } finally {
        // Clear ONLY after initialized is set — not before
        clearTimeout(safetyTimeout)
      }
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (session?.user) {
        const currentUserId = useAuthStore.getState().user?.id
        // If a different user just signed in, wipe the stale profile immediately
        // so route guards never see the old user's role
        if (currentUserId !== session.user.id) {
          useAuthStore.setState({ user: session.user, profile: null })
        } else {
          useAuthStore.setState({ user: session.user })
        }
        const profile = await fetchProfileSafe(session.user.id)
        if (mounted) useAuthStore.setState({ profile, initialized: true })
      } else {
        if (mounted) useAuthStore.setState({ user: null, profile: null, initialized: true })
      }
    })

    return () => {
      mounted = false
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [])
}
