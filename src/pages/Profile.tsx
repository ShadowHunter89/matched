import { useState, useEffect, KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Button from '@/components/ui/Button'

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_SUGGESTIONS = [
  'React', 'TypeScript', 'Node.js', 'Python', 'Go', 'Rust', 'GraphQL', 'PostgreSQL',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'System Architecture', 'API Design',
  'Engineering Leadership', 'Product Strategy', 'UX Design', 'Figma', 'Brand Design',
  'Data Analysis', 'Machine Learning', 'Growth', 'Financial Modeling', 'FP&A',
  'Fundraising', 'Operations', 'Sales', 'Marketing', 'Content Strategy', 'SEO',
  'Mobile Development', 'iOS', 'Android', 'React Native', 'Flutter', 'DevOps',
  'Security', 'A/B Testing', 'Analytics',
]

const INDUSTRY_SUGGESTIONS = [
  'SaaS', 'Fintech', 'AI', 'Marketplace', 'Consumer', 'DevTools', 'Healthcare',
  'E-commerce', 'EdTech', 'Media', 'Gaming', 'Crypto', 'Web3', 'Enterprise',
  'Government', 'Non-profit', 'Climate', 'Logistics',
]

const REMOTE_OPTIONS = [
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite_only', label: 'On-site only' },
  { value: 'flexible', label: 'Flexible' },
]

const TIMEZONES = [
  'UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileFormState {
  headline: string
  bio: string
  yearsExperience: string
  skills: string[]
  preferredIndustries: string[]
  hourlyRateMin: string
  hourlyRateMax: string
  availabilityHours: string
  timezone: string
  remotePreference: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Profile() {
  const { user } = useAuthStore()

  const [form, setForm] = useState<ProfileFormState>({
    headline: '',
    bio: '',
    yearsExperience: '',
    skills: [],
    preferredIndustries: [],
    hourlyRateMin: '',
    hourlyRateMax: '',
    availabilityHours: '',
    timezone: 'UTC',
    remotePreference: 'flexible',
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Tag input states
  const [skillInput, setSkillInput] = useState('')
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([])
  const [industryInput, setIndustryInput] = useState('')
  const [industrySuggestions, setIndustrySuggestions] = useState<string[]>([])

  const setField = (key: keyof ProfileFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // ── Fetch existing data
  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      const { data } = await supabase
        .from('professional_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setForm({
          headline: data.headline || '',
          bio: data.bio || '',
          yearsExperience: data.years_experience?.toString() || '',
          skills: data.skills || [],
          preferredIndustries: data.preferred_industries || [],
          hourlyRateMin: data.hourly_rate_min ? (data.hourly_rate_min / 100).toString() : '',
          hourlyRateMax: data.hourly_rate_max ? (data.hourly_rate_max / 100).toString() : '',
          availabilityHours: data.availability_hours?.toString() || '',
          timezone: data.timezone || 'UTC',
          remotePreference: data.remote_preference || 'flexible',
        })
      }
      setLoading(false)
    }
    fetch()
  }, [user])

  // ── Skill tag input
  const handleSkillInput = (val: string) => {
    setSkillInput(val)
    if (val.trim()) {
      const lower = val.toLowerCase()
      setSkillSuggestions(
        SKILL_SUGGESTIONS.filter(
          (s) => s.toLowerCase().includes(lower) && !form.skills.includes(s)
        ).slice(0, 6)
      )
    } else {
      setSkillSuggestions([])
    }
  }

  const addSkill = (skill: string) => {
    const trimmed = skill.trim()
    if (!trimmed || form.skills.includes(trimmed)) return
    setForm((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }))
    setSkillInput('')
    setSkillSuggestions([])
  }

  const removeSkill = (skill: string) =>
    setForm((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== skill) }))

  const handleSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill(skillInput)
    }
    if (e.key === 'Backspace' && !skillInput && form.skills.length > 0) {
      setForm((prev) => ({ ...prev, skills: prev.skills.slice(0, -1) }))
    }
  }

  // ── Industry tag input
  const handleIndustryInput = (val: string) => {
    setIndustryInput(val)
    if (val.trim()) {
      const lower = val.toLowerCase()
      setIndustrySuggestions(
        INDUSTRY_SUGGESTIONS.filter(
          (s) => s.toLowerCase().includes(lower) && !form.preferredIndustries.includes(s)
        ).slice(0, 6)
      )
    } else {
      setIndustrySuggestions([])
    }
  }

  const addIndustry = (ind: string) => {
    const trimmed = ind.trim()
    if (!trimmed || form.preferredIndustries.includes(trimmed)) return
    setForm((prev) => ({ ...prev, preferredIndustries: [...prev.preferredIndustries, trimmed] }))
    setIndustryInput('')
    setIndustrySuggestions([])
  }

  const removeIndustry = (ind: string) =>
    setForm((prev) => ({ ...prev, preferredIndustries: prev.preferredIndustries.filter((i) => i !== ind) }))

  const handleIndustryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addIndustry(industryInput)
    }
    if (e.key === 'Backspace' && !industryInput && form.preferredIndustries.length > 0) {
      setForm((prev) => ({ ...prev, preferredIndustries: prev.preferredIndustries.slice(0, -1) }))
    }
  }

  // ── Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSaving(true)
    setSaved(false)

    try {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        headline: form.headline.trim() || null,
        bio: form.bio.trim() || null,
        years_experience: form.yearsExperience ? parseInt(form.yearsExperience) : null,
        skills: form.skills,
        preferred_industries: form.preferredIndustries,
        hourly_rate_min: form.hourlyRateMin ? Math.round(parseFloat(form.hourlyRateMin) * 100) : null,
        hourly_rate_max: form.hourlyRateMax ? Math.round(parseFloat(form.hourlyRateMax) * 100) : null,
        availability_hours: form.availabilityHours ? parseInt(form.availabilityHours) : null,
        timezone: form.timezone || null,
        remote_preference: form.remotePreference,
      }

      const { error } = await supabase
        .from('professional_profiles')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error

      // Re-embed silently
      supabase.functions
        .invoke('embed-professional', { body: { userId: user.id } })
        .catch(() => {})

      setSaved(true)
      setToast('Profile updated. Your matches will reflect these changes.')
      setTimeout(() => setToast(null), 4000)
    } catch (err: any) {
      setToast('Failed to save profile. Please try again.')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Edit Profile">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#888' }}>
          Loading...
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Edit Profile">
      <title>Edit Profile · Matched</title>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            background: saved ? '#E8FF47' : '#ff6b6b',
            color: '#000',
            padding: '12px 24px',
            borderRadius: 100,
            fontWeight: 600,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
          Edit profile
        </h1>
        <p style={{ color: '#888', fontSize: 15, margin: '0 0 40px' }}>
          Keep this up to date to improve your match quality.
        </p>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Headline */}
          <FieldGroup label="Headline">
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setField('headline', e.target.value)}
              placeholder="e.g. Fractional CTO · Ex-Stripe, Plaid"
              style={inputStyle}
            />
          </FieldGroup>

          {/* Bio */}
          <FieldGroup label="Bio">
            <textarea
              value={form.bio}
              onChange={(e) => setField('bio', e.target.value)}
              placeholder="Describe your background, what you've built, and how you work best..."
              rows={5}
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
            />
          </FieldGroup>

          {/* Years of experience */}
          <FieldGroup label="Years of experience">
            <input
              type="number"
              value={form.yearsExperience}
              onChange={(e) => setField('yearsExperience', e.target.value)}
              placeholder="e.g. 8"
              min={0}
              max={50}
              style={inputStyle}
            />
          </FieldGroup>

          {/* Skills */}
          <FieldGroup label="Skills">
            <TagEditor
              tags={form.skills}
              input={skillInput}
              suggestions={skillSuggestions}
              onInput={handleSkillInput}
              onKeyDown={handleSkillKeyDown}
              onAdd={addSkill}
              onRemove={removeSkill}
              placeholder="Type a skill and press Enter"
            />
          </FieldGroup>

          {/* Preferred industries */}
          <FieldGroup label="Preferred industries">
            <TagEditor
              tags={form.preferredIndustries}
              input={industryInput}
              suggestions={industrySuggestions}
              onInput={handleIndustryInput}
              onKeyDown={handleIndustryKeyDown}
              onAdd={addIndustry}
              onRemove={removeIndustry}
              placeholder="Type an industry and press Enter"
            />
          </FieldGroup>

          {/* Hourly rate */}
          <div>
            <label style={labelStyle}>Hourly rate ($/hr)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <input
                type="number"
                value={form.hourlyRateMin}
                onChange={(e) => setField('hourlyRateMin', e.target.value)}
                placeholder="Min (e.g. 100)"
                min={0}
                style={inputStyle}
              />
              <input
                type="number"
                value={form.hourlyRateMax}
                onChange={(e) => setField('hourlyRateMax', e.target.value)}
                placeholder="Max (e.g. 200)"
                min={0}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Availability */}
          <FieldGroup label="Availability (hours/week)">
            <input
              type="number"
              value={form.availabilityHours}
              onChange={(e) => setField('availabilityHours', e.target.value)}
              placeholder="e.g. 20"
              min={1}
              max={40}
              style={inputStyle}
            />
          </FieldGroup>

          {/* Timezone */}
          <FieldGroup label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setField('timezone', e.target.value)}
              style={inputStyle}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </FieldGroup>

          {/* Remote preference */}
          <FieldGroup label="Remote preference">
            <select
              value={form.remotePreference}
              onChange={(e) => setField('remotePreference', e.target.value)}
              style={inputStyle}
            >
              {REMOTE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldGroup>

          {/* Submit */}
          <div style={{ paddingTop: 8 }}>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              style={{ width: '100%' }}
            >
              {saving ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}

// ─── TagEditor ────────────────────────────────────────────────────────────────

function TagEditor({
  tags,
  input,
  suggestions,
  onInput,
  onKeyDown,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[]
  input: string
  suggestions: string[]
  onInput: (v: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  placeholder: string
}) {
  return (
    <div>
      <div
        style={{
          ...inputStyle,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '10px 12px',
          minHeight: 48,
          cursor: 'text',
        }}
        onClick={(e) => {
          const inp = (e.currentTarget as HTMLDivElement).querySelector('input')
          inp?.focus()
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#252525',
              border: '1px solid #3a3a3a',
              borderRadius: 100,
              padding: '3px 10px 3px 12px',
              fontSize: 13,
              color: '#fff',
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: 0,
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 14,
            fontFamily: 'inherit',
            minWidth: 160,
            flex: 1,
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdd(s)}
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: 100,
                color: '#888',
                fontSize: 12,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FieldGroup ───────────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#141414',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: '#fff',
  fontSize: 14,
  padding: '12px 16px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
