import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const { setUser, setProfile, setInitialized } = useAuthStore()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
        setProfile(profile)
      }

      setInitialized(true)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const user = session?.user ?? null
        setUser(user)

        if (user && event === 'SIGNED_IN') {
          // Always re-fetch fresh profile on sign-in (never use cached state)
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .single()
          setProfile(profile)
        } else if (user && event === 'TOKEN_REFRESHED') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .single()
          setProfile(profile)
        } else if (event === 'SIGNED_OUT') {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setProfile, setInitialized])
}
