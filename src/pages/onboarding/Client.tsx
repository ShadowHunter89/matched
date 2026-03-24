import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-500', label: '201–500 employees' },
  { value: '500+', label: '500+ employees' },
]

const INDUSTRY_OPTIONS = [
  { value: 'SaaS', label: 'SaaS' },
  { value: 'Fintech', label: 'Fintech' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'E-commerce', label: 'E-commerce' },
  { value: 'AI/ML', label: 'AI/ML' },
  { value: 'DevTools', label: 'DevTools' },
  { value: 'Enterprise Software', label: 'Enterprise Software' },
  { value: 'Consumer', label: 'Consumer' },
  { value: 'Marketplace', label: 'Marketplace' },
  { value: 'Media', label: 'Media' },
  { value: 'Education', label: 'Education' },
  { value: 'Other', label: 'Other' },
]

export default function ClientOnboarding() {
  const navigate = useNavigate()
  const { user, profile, setProfile } = useAuthStore()
  const [checkingExisting, setCheckingExisting] = useState(true)

  const [companyName, setCompanyName] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [industry, setIndustry] = useState('')
  const [about, setAbout] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = 'Set up your company — Matched'
  }, [])

  // Check if client_profiles already has company_name — if so, redirect
  useEffect(() => {
    const checkExisting = async () => {
      if (!user) { setCheckingExisting(false); return }
      try {
        const { data } = await supabase
          .from('client_profiles')
          .select('company_name')
          .eq('user_id', user.id)
          .single()

        if (data?.company_name) {
          navigate('/dashboard/client')
          return
        }
      } catch {
        // No row yet — proceed normally
      }
      setCheckingExisting(false)
    }
    checkExisting()
  }, [user, navigate])

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!companyName.trim()) errors.companyName = 'Company name is required.'
    if (!companySize) errors.companySize = 'Please select a company size.'
    if (!industry) errors.industry = 'Please select an industry.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    if (!user) return

    setLoading(true)
    try {
      // Upsert client_profiles
      const { error: clientError } = await supabase
        .from('client_profiles')
        .upsert(
          {
            user_id: user.id,
            company_name: companyName.trim(),
            company_size: companySize,
            industry,
            bio: about.trim() || null,
          },
          { onConflict: 'user_id' }
        )
      if (clientError) throw clientError

      // Mark onboarding complete
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('user_id', user.id)
      if (profileError) throw profileError

      // Update auth store
      if (profile) {
        setProfile({ ...profile, onboarding_complete: true })
      }

      navigate('/dashboard/client')
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingExisting) {
    return (
      <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-[#2a2a2a] border-t-[#E8FF47] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center px-4 py-16 font-sans">
      {/* Background dot grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1 mb-4">
            <span className="text-lg font-bold text-[#E8FF47]">Matched</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47] mb-3.5 -ml-0.5" />
          </div>
          <h1 className="text-3xl font-bold text-white">Tell us about your company.</h1>
          <p className="text-[#888888] text-sm mt-2">
            This helps professionals understand who they're working with.
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8">
          {/* Error */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Company Name"
              type="text"
              placeholder="Acme Corp"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value)
                if (fieldErrors.companyName) setFieldErrors((prev) => ({ ...prev, companyName: '' }))
              }}
              error={fieldErrors.companyName}
            />

            <Select
              label="Company Size"
              options={COMPANY_SIZE_OPTIONS}
              placeholder="Select size"
              value={companySize}
              onChange={(e) => {
                setCompanySize(e.target.value)
                if (fieldErrors.companySize) setFieldErrors((prev) => ({ ...prev, companySize: '' }))
              }}
              error={fieldErrors.companySize}
            />

            <Select
              label="Industry"
              options={INDUSTRY_OPTIONS}
              placeholder="Select industry"
              value={industry}
              onChange={(e) => {
                setIndustry(e.target.value)
                if (fieldErrors.industry) setFieldErrors((prev) => ({ ...prev, industry: '' }))
              }}
              error={fieldErrors.industry}
            />

            <Textarea
              label="About your company"
              placeholder="Brief description of what your company does and the kind of work you typically need help with. (optional)"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={4}
            />

            <Button type="submit" size="lg" className="w-full mt-2" loading={loading}>
              Complete setup
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#888888] mt-6">
          You can update your company profile at any time.
        </p>
      </div>
    </div>
  )
}
