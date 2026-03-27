import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

type Tab = 'signin' | 'signup'

export default function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, setProfile } = useAuthStore()

  const [tab, setTab] = useState<Tab>(
    (searchParams.get('tab') as Tab) === 'signup' ? 'signup' : 'signin'
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    document.title = tab === 'signin' ? 'Sign In — Matched' : 'Sign Up — Matched'
  }, [tab])

  useEffect(() => {
    if (searchParams.get('verified') === 'true') setVerified(true)
  }, [searchParams])

  const handleTabSwitch = (t: Tab) => {
    setTab(t)
    setError('')
    setFullName('')
    setEmail('')
    setPassword('')
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      })
      if (signUpError) throw signUpError
      if (data?.user) {
        // Set user immediately — don't wait for onAuthStateChange race
        setUser(data.user)
        setProfile(null)  // Clear any stale profile from previous session
        navigate('/role')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (!password) { setError('Please enter your password.'); return }

    setLoading(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      if (data?.user) {
        // Sync user into store immediately so route guards don't redirect
        setUser(data.user)

        // Fetch profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .single()

        if (profileData) {
          setProfile(profileData)
          if (profileData.onboarding_complete) {
            navigate(profileData.role === 'professional' ? '/dashboard/professional' : '/dashboard/client')
          } else if (profileData.role) {
            navigate(`/onboarding/${profileData.role}`)
          } else {
            navigate('/role')
          }
        } else {
          navigate('/role')
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

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

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-1 group">
            <span className="text-2xl font-bold text-[#E8FF47] tracking-tight">Matched</span>
            <span className="w-2 h-2 rounded-full bg-[#E8FF47] mb-4 -ml-0.5" />
          </Link>
          <p className="text-[#888888] text-sm mt-2">
            {tab === 'signin' ? 'Welcome back.' : 'Create your account.'}
          </p>
        </div>

        {/* Email verified message */}
        {verified && (
          <div className="mb-6 p-4 rounded-2xl bg-[#A8FF3E]/10 border border-[#A8FF3E]/20 text-[#A8FF3E] text-sm text-center">
            Email confirmed. You can now sign in.
          </div>
        )}

        {/* Card */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8">
          {/* Tab switcher */}
          <div className="flex items-center bg-[#0C0C0C] border border-[#2a2a2a] rounded-full p-1 mb-8">
            <button
              onClick={() => handleTabSwitch('signin')}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                tab === 'signin'
                  ? 'bg-[#E8FF47] text-black shadow-sm'
                  : 'text-[#888888] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => handleTabSwitch('signup')}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                tab === 'signup'
                  ? 'bg-[#E8FF47] text-black shadow-sm'
                  : 'text-[#888888] hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Sign In Form */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
                Sign in
              </Button>
            </form>
          )}

          {/* Sign Up Form */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                placeholder="Alex Johnson"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                hint="Minimum 8 characters"
                required
              />
              <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
                Create account
              </Button>
            </form>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[#888888] mt-6">
          By continuing you agree to our{' '}
          <span className="text-white cursor-pointer hover:text-[#E8FF47] transition-colors">Terms</span>
          {' '}and{' '}
          <span className="text-white cursor-pointer hover:text-[#E8FF47] transition-colors">Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}
