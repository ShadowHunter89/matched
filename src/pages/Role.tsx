import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

type Role = 'professional' | 'client'

export default function Role() {
  const navigate = useNavigate()
  const { user, profile, setProfile } = useAuthStore()
  const [selected, setSelected] = useState<Role | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Choose your role — Matched'
  }, [])

  // Redirect if role already set and onboarding complete
  useEffect(() => {
    if (profile?.onboarding_complete && profile?.role) {
      navigate(profile.role === 'professional' ? '/dashboard/professional' : '/dashboard/client')
    }
  }, [profile, navigate])

  const handleContinue = async () => {
    if (!selected || !user) return
    setError('')
    setLoading(true)

    try {
      // Update profile role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: selected })
        .eq('user_id', user.id)

      if (profileError) throw profileError

      // Upsert role-specific profile
      if (selected === 'professional') {
        const { error: profError } = await supabase
          .from('professional_profiles')
          .upsert({ user_id: user.id }, { onConflict: 'user_id' })
        if (profError) throw profError
      } else {
        const { error: clientError } = await supabase
          .from('client_profiles')
          .upsert({ user_id: user.id }, { onConflict: 'user_id' })
        if (clientError) throw clientError
      }

      // Update store
      if (profile) {
        setProfile({ ...profile, role: selected })
      }

      navigate(`/onboarding/${selected}`)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const cards: { role: Role; icon: React.ReactNode; title: string; description: string }[] = [
    {
      role: 'professional',
      icon: <Briefcase size={32} strokeWidth={1.5} />,
      title: "I'm a Professional",
      description:
        'Get matched to high-quality opportunities. No applying, no hunting. Work comes to you.',
    },
    {
      role: 'client',
      icon: <Search size={32} strokeWidth={1.5} />,
      title: "I'm Hiring",
      description:
        'Post your opportunity and receive the top 3–5 matched professionals within hours.',
    },
  ]

  return (
    <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center px-4 py-16 font-sans">
      {/* Background dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1 mb-6">
            <span className="text-xl font-bold text-[#E8FF47] tracking-tight">Matched</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47] mb-3.5 -ml-0.5" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            How are you using Matched?
          </h1>
          <p className="text-[#888888] mt-3 text-base">
            Choose your role to get started.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {cards.map(({ role, icon, title, description }) => (
            <button
              key={role}
              onClick={() => setSelected(role)}
              className={`relative flex flex-col items-start text-left p-8 rounded-2xl border transition-all duration-200 ${
                selected === role
                  ? 'bg-[#141414] border-[#E8FF47]/60 shadow-[0_0_0_1px_#E8FF47]/20'
                  : 'bg-[#141414] border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#181818]'
              }`}
            >
              {/* Selected indicator */}
              {selected === role && (
                <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-[#E8FF47] flex items-center justify-center">
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              <div className={`mb-5 transition-colors duration-200 ${selected === role ? 'text-[#E8FF47]' : 'text-[#888888]'}`}>
                {icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-[#888888] leading-relaxed">{description}</p>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Continue button */}
        <Button
          size="lg"
          className="w-full"
          disabled={!selected}
          loading={loading}
          onClick={handleContinue}
        >
          Continue
        </Button>

        <p className="text-center text-xs text-[#888888] mt-4">
          You can change this later in your settings.
        </p>
      </div>
    </div>
  )
}
