import React, { useEffect, useState, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { SkillTag } from '@/components/ui/SkillTag'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

const TOTAL_STEPS = 3

const SKILL_SUGGESTIONS = [
  'React', 'TypeScript', 'Node.js', 'Python', 'Go', 'Rust', 'System Design',
  'Product Strategy', 'Engineering Leadership', 'Data Analysis', 'Machine Learning',
  'DevOps', 'AWS', 'Financial Modeling', 'Sales', 'Marketing', 'Design',
  'UX Research', 'Brand Design', 'Figma',
]

const INDUSTRY_SUGGESTIONS = [
  'SaaS', 'Fintech', 'AI/ML', 'Healthcare', 'E-commerce', 'DevTools',
  'Consumer', 'Enterprise', 'Marketplace', 'Cybersecurity',
]

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'EST', label: 'EST (UTC-5)' },
  { value: 'PST', label: 'PST (UTC-8)' },
  { value: 'CET', label: 'CET (UTC+1)' },
  { value: 'IST', label: 'IST (UTC+5:30)' },
  { value: 'AEST', label: 'AEST (UTC+10)' },
]

const REMOTE_OPTIONS = [
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite_only', label: 'On-site only' },
  { value: 'flexible', label: 'Flexible' },
]

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-10">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i + 1 === current
              ? 'w-6 h-2 bg-[#E8FF47]'
              : i + 1 < current
              ? 'w-2 h-2 bg-[#E8FF47]/40'
              : 'w-2 h-2 bg-[#2a2a2a]'
          }`}
        />
      ))}
    </div>
  )
}

export default function ProfessionalOnboarding() {
  const navigate = useNavigate()
  const { user, profile, setProfile } = useAuthStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 fields
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')

  // Step 2 fields
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [industries, setIndustries] = useState<string[]>([])
  const [industryInput, setIndustryInput] = useState('')

  // Step 3 fields
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState('')
  const [timezone, setTimezone] = useState('')
  const [remotePreference, setRemotePreference] = useState('')

  useEffect(() => {
    document.title = 'Set up your profile — Matched'
  }, [])

  // --- Skills tag input ---
  const addSkill = (s: string) => {
    const trimmed = s.trim()
    if (!trimmed || skills.includes(trimmed) || skills.length >= 15) return
    setSkills([...skills, trimmed])
    setSkillInput('')
  }

  const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill(skillInput)
    }
  }

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s))

  // --- Industries tag input ---
  const addIndustry = (ind: string) => {
    const trimmed = ind.trim()
    if (!trimmed || industries.includes(trimmed)) return
    setIndustries([...industries, trimmed])
    setIndustryInput('')
  }

  const handleIndustryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addIndustry(industryInput)
    }
  }

  const removeIndustry = (ind: string) => setIndustries(industries.filter((x) => x !== ind))

  // --- Step validation ---
  const validateStep = (): string => {
    if (step === 1) {
      if (!fullName.trim()) return 'Please enter your full name.'
      if (!headline.trim()) return 'Please enter a professional headline.'
      if (headline.trim().length < 10) return 'Headline must be at least 10 characters.'
      if (!bio.trim()) return 'Please enter a bio.'
      if (bio.trim().length < 50) return 'Bio must be at least 50 characters.'
    }
    if (step === 2) {
      if (skills.length < 3) return 'Please add at least 3 skills.'
    }
    if (step === 3) {
      if (!rateMin || !rateMax) return 'Please enter your hourly rate range.'
      if (Number(rateMin) >= Number(rateMax)) return 'Minimum rate must be less than maximum rate.'
    }
    return ''
  }

  const handleNext = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    setError('')
    setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    const err = validateStep()
    if (err) { setError(err); return }
    if (!user) return

    setError('')
    setLoading(true)

    try {
      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), onboarding_complete: true })
        .eq('user_id', user.id)
      if (profileError) throw profileError

      // Upsert professional_profiles
      const { error: profError } = await supabase
        .from('professional_profiles')
        .upsert(
          {
            user_id: user.id,
            headline: headline.trim() || null,
            bio: bio.trim() || null,
            years_experience: yearsExperience ? Number(yearsExperience) : null,
            skills,
            preferred_industries: industries,
            hourly_rate_min: rateMin ? Math.round(Number(rateMin) * 100) : null,
            hourly_rate_max: rateMax ? Math.round(Number(rateMax) * 100) : null,
            availability_hours: hoursPerWeek ? Number(hoursPerWeek) : null,
            timezone: timezone || null,
            remote_preference: remotePreference || null,
          },
          { onConflict: 'user_id' }
        )
      if (profError) throw profError

      // Trigger embedding edge function
      try {
        await supabase.functions.invoke('embed-professional', {
          body: { userId: user.id },
        })
      } catch {
        // Non-fatal — embedding can be retried asynchronously
      }

      // Always fetch fresh profile and update store — handles both new and existing users
      const { data: freshProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (freshProfile) {
        setProfile(freshProfile)
      } else if (profile) {
        setProfile({ ...profile, full_name: fullName.trim(), onboarding_complete: true })
      }

      navigate('/dashboard/professional')
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const stepTitles = [
    { title: 'Who are you?', description: 'Tell us about yourself so we can match you accurately.' },
    { title: 'Your expertise', description: 'What skills and industries do you work in?' },
    { title: 'Availability & rates', description: 'Help clients understand your availability and pricing.' },
  ]

  return (
    <div className="min-h-screen bg-[#0C0C0C] flex items-start justify-center px-4 py-16 font-sans">
      {/* Background dot grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1">
            <span className="text-lg font-bold text-[#E8FF47]">Matched</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47] mb-3.5 -ml-0.5" />
          </div>
        </div>

        {/* Progress dots */}
        <ProgressDots current={step} total={TOTAL_STEPS} />

        {/* Card */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8">
          {/* Step header */}
          <div className="mb-7">
            <p className="text-xs text-[#888888] font-medium uppercase tracking-widest mb-1">
              Step {step} of {TOTAL_STEPS}
            </p>
            <h1 className="text-2xl font-bold text-white">{stepTitles[step - 1].title}</h1>
            <p className="text-[#888888] text-sm mt-1">{stepTitles[step - 1].description}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <Input
                label="Full Name"
                type="text"
                placeholder="Alex Johnson"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <Input
                label="Professional Headline"
                type="text"
                placeholder="Fractional CTO · Ex-Stripe"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                hint="One line that captures who you are professionally."
              />
              <Textarea
                label="Bio"
                placeholder="Tell clients what you do, what you've built, and what kind of work you're looking for."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
              />
              <Input
                label="Years of Experience"
                type="number"
                placeholder="8"
                min={0}
                max={60}
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
              />
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-7">
              {/* Skills */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-white block">
                  Skills
                  <span className="text-[#888888] font-normal ml-2">({skills.length}/15)</span>
                </label>
                <div className={`bg-[#0C0C0C] border border-[#2a2a2a] rounded-xl p-3 focus-within:border-[#E8FF47]/50 transition-colors`}>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {skills.map((s) => (
                      <SkillTag key={s} skill={s} onRemove={() => removeSkill(s)} selected />
                    ))}
                  </div>
                  <input
                    className="bg-transparent text-white text-sm outline-none placeholder:text-[#888888] w-full"
                    placeholder={skills.length >= 15 ? 'Max 15 skills reached' : 'Type a skill and press Enter…'}
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleSkillKeyDown}
                    disabled={skills.length >= 15}
                  />
                </div>
                {/* Suggestions */}
                <div className="flex flex-wrap gap-2">
                  {SKILL_SUGGESTIONS.filter((s) => !skills.includes(s)).map((s) => (
                    <SkillTag key={s} skill={s} onClick={() => addSkill(s)} size="sm" />
                  ))}
                </div>
              </div>

              {/* Industries */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-white block">Preferred Industries</label>
                <div className="bg-[#0C0C0C] border border-[#2a2a2a] rounded-xl p-3 focus-within:border-[#E8FF47]/50 transition-colors">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {industries.map((ind) => (
                      <SkillTag key={ind} skill={ind} onRemove={() => removeIndustry(ind)} selected />
                    ))}
                  </div>
                  <input
                    className="bg-transparent text-white text-sm outline-none placeholder:text-[#888888] w-full"
                    placeholder="Type an industry and press Enter…"
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    onKeyDown={handleIndustryKeyDown}
                  />
                </div>
                {/* Suggestions */}
                <div className="flex flex-wrap gap-2">
                  {INDUSTRY_SUGGESTIONS.filter((i) => !industries.includes(i)).map((i) => (
                    <SkillTag key={i} skill={i} onClick={() => addIndustry(i)} size="sm" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Rate ($/hr)"
                  type="number"
                  placeholder="150"
                  min={0}
                  value={rateMin}
                  onChange={(e) => setRateMin(e.target.value)}
                />
                <Input
                  label="Max Rate ($/hr)"
                  type="number"
                  placeholder="250"
                  min={0}
                  value={rateMax}
                  onChange={(e) => setRateMax(e.target.value)}
                />
              </div>
              <Input
                label="Hours Available per Week"
                type="number"
                placeholder="20"
                min={1}
                max={168}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
              />
              <Select
                label="Timezone"
                options={TIMEZONE_OPTIONS}
                placeholder="Select your timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
              <Select
                label="Remote Preference"
                options={REMOTE_OPTIONS}
                placeholder="Select a preference"
                value={remotePreference}
                onChange={(e) => setRemotePreference(e.target.value)}
              />
            </div>
          )}

          {/* Navigation buttons */}
          <div className={`flex gap-3 mt-8 ${step > 1 ? 'justify-between' : 'justify-end'}`}>
            {step > 1 && (
              <Button variant="secondary" size="md" onClick={handleBack} disabled={loading}>
                Back
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button size="md" onClick={handleNext}>
                Continue
              </Button>
            ) : (
              <Button size="md" loading={loading} onClick={handleSubmit}>
                Finish setup
              </Button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[#888888] mt-6">
          You can edit your profile at any time after setup.
        </p>
      </div>
    </div>
  )
}
