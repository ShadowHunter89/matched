import { useState, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
  'Security', 'Blockchain', 'Web3', 'Solidity', 'A/B Testing', 'Analytics',
]

const REMOTE_OPTIONS = [
  { value: 'remote_only', label: 'Remote only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite_only', label: 'On-site only' },
  { value: 'flexible', label: 'Flexible' },
]

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  title: string
  description: string
  skills: string[]
  budgetMin: string
  budgetMax: string
  hoursPerWeek: string
  durationWeeks: string
  remoteOption: string
  timezoneRequirements: string
}

interface FormErrors {
  title?: string
  description?: string
  skills?: string
  budget?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewOpportunity() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    skills: [],
    budgetMin: '',
    budgetMax: '',
    hoursPerWeek: '',
    durationWeeks: '',
    remoteOption: 'flexible',
    timezoneRequirements: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [skillInput, setSkillInput] = useState('')
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [matching, setMatching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // ── Skill input
  const handleSkillInput = (val: string) => {
    setSkillInput(val)
    if (val.trim().length > 0) {
      const lower = val.toLowerCase()
      const suggestions = SKILL_SUGGESTIONS.filter(
        (s) => s.toLowerCase().includes(lower) && !form.skills.includes(s)
      ).slice(0, 6)
      setSkillSuggestions(suggestions)
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
    if (e.key === 'Backspace' && skillInput === '' && form.skills.length > 0) {
      setForm((prev) => ({ ...prev, skills: prev.skills.slice(0, -1) }))
    }
  }

  const sanitize = (str: string): string => str.replace(/<[^>]*>/g, '').trim().slice(0, 5000)

  // ── Validate
  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!form.title.trim()) errs.title = 'Title is required'
    if (form.title.trim().length > 0 && form.title.trim().length < 5) errs.title = 'Title must be at least 5 characters'
    if (!form.description.trim()) errs.description = 'Description is required'
    if (form.description.trim().length > 0 && form.description.trim().length < 50) errs.description = 'Description must be at least 50 characters'
    if (form.skills.length === 0) errs.skills = 'At least one skill is required'
    const min = parseFloat(form.budgetMin)
    const max = parseFloat(form.budgetMax)
    if (form.budgetMin && form.budgetMax && !isNaN(min) && !isNaN(max) && min >= max) {
      errs.budget = 'Budget minimum must be less than maximum'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || !user) return

    setSubmitting(true)

    try {
      // Rate limiting check: max 10 opportunities per day
      const { count } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      if ((count || 0) >= 10) {
        setErrors({ title: 'Daily limit reached. You can post up to 10 opportunities per day.' })
        setSubmitting(false)
        return
      }

      const payload: Record<string, unknown> = {
        title: sanitize(form.title),
        description: sanitize(form.description) || null,
        required_skills: form.skills.map((s) => sanitize(s)),
        remote_option: form.remoteOption,
        status: 'open',
      }
      if (form.budgetMin) payload.budget_min = Math.round(parseFloat(form.budgetMin) * 100)
      if (form.budgetMax) payload.budget_max = Math.round(parseFloat(form.budgetMax) * 100)
      if (form.hoursPerWeek) payload.hours_per_week = parseInt(form.hoursPerWeek)
      if (form.durationWeeks) payload.duration_weeks = parseInt(form.durationWeeks)
      if (form.timezoneRequirements) payload.timezone_requirements = sanitize(form.timezoneRequirements)

      const { data: opp, error } = await supabase
        .from('opportunities')
        .insert({ client_id: user.id, ...payload })
        .select()
        .single()

      if (error) {
        console.error('Insert failed:', error)
        throw error
      }

      setSubmitting(false)
      setMatching(true)

      const { error: matchError } = await supabase
        .functions.invoke('match-professionals', {
          body: { opportunityId: opp.id },
        })

      setMatching(false)
      setToast(matchError
        ? 'Opportunity posted! Processing matches...'
        : 'Opportunity posted! Matching professionals now...')

      setTimeout(() => {
        navigate('/dashboard/client', { state: { selectedOppId: opp.id } })
      }, 800)
    } catch (err: unknown) {
      console.error('Failed to post opportunity:', err)
      setSubmitting(false)
      setMatching(false)
      setToast('Failed to post opportunity. Please try again.')
    }
  }

  return (
    <DashboardLayout title="Post Opportunity">
      <title>Post Opportunity · Matched</title>

      {/* Matching overlay */}
      {matching && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12,12,12,0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            gap: 20,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: '3px solid #2a2a2a',
              borderTopColor: '#E8FF47',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }}
          />
          <p style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0, animation: 'pulse 2s ease-in-out infinite' }}>
            Analyzing professional pool...
          </p>
          <p style={{ fontSize: 14, color: '#888', margin: 0 }}>
            This usually takes a few seconds
          </p>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          `}</style>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#E8FF47',
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
          Post an opportunity
        </h1>
        <p style={{ color: '#888', fontSize: 15, margin: '0 0 40px' }}>
          Tell us what you need and we'll match you with the right professionals.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Title */}
          <FieldGroup label="Title" error={errors.title} required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="e.g. Fractional CTO for Series A fintech"
              style={inputStyle(!!errors.title)}
            />
          </FieldGroup>

          {/* Description */}
          <FieldGroup label="Description" error={errors.description} required>
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Describe the project, context, team, and what success looks like..."
              rows={5}
              style={{ ...inputStyle(!!errors.description), minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
            />
          </FieldGroup>

          {/* Skills */}
          <FieldGroup label="Required skills" error={errors.skills} required>
            <div
              style={{
                ...inputStyle(!!errors.skills),
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '10px 12px',
                minHeight: 48,
                cursor: 'text',
                position: 'relative',
              }}
              onClick={(e) => {
                const input = (e.currentTarget as HTMLDivElement).querySelector('input')
                input?.focus()
              }}
            >
              {form.skills.map((skill) => (
                <span
                  key={skill}
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
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
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
                value={skillInput}
                onChange={(e) => handleSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                placeholder={form.skills.length === 0 ? 'Type a skill and press Enter' : ''}
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

            {/* Suggestions */}
            {skillSuggestions.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {skillSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addSkill(s)}
                    style={{
                      background: '#1a1a1a',
                      border: '1px solid #2a2a2a',
                      borderRadius: 100,
                      color: '#888',
                      fontSize: 12,
                      padding: '4px 12px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.target as HTMLButtonElement).style.borderColor = '#E8FF47'
                      ;(e.target as HTMLButtonElement).style.color = '#E8FF47'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.target as HTMLButtonElement).style.borderColor = '#2a2a2a'
                      ;(e.target as HTMLButtonElement).style.color = '#888'
                    }}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </FieldGroup>

          {/* Budget */}
          <div>
            <label style={labelStyle}>
              Budget ($/hr)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <input
                  type="number"
                  value={form.budgetMin}
                  onChange={(e) => setField('budgetMin', e.target.value)}
                  placeholder="Min (e.g. 100)"
                  min={0}
                  style={inputStyle(false)}
                />
              </div>
              <div>
                <input
                  type="number"
                  value={form.budgetMax}
                  onChange={(e) => setField('budgetMax', e.target.value)}
                  placeholder="Max (e.g. 200)"
                  min={0}
                  style={inputStyle(false)}
                />
              </div>
            </div>
            {errors.budget && <p style={errorStyle}>{errors.budget}</p>}
          </div>

          {/* Hours + Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FieldGroup label="Hours per week">
              <input
                type="number"
                value={form.hoursPerWeek}
                onChange={(e) => setField('hoursPerWeek', e.target.value)}
                placeholder="e.g. 20"
                min={1}
                max={40}
                style={inputStyle(false)}
              />
            </FieldGroup>

            <FieldGroup label="Duration (weeks, optional)">
              <input
                type="number"
                value={form.durationWeeks}
                onChange={(e) => setField('durationWeeks', e.target.value)}
                placeholder="e.g. 12"
                min={1}
                style={inputStyle(false)}
              />
            </FieldGroup>
          </div>

          {/* Remote preference */}
          <FieldGroup label="Remote preference">
            <select
              value={form.remoteOption}
              onChange={(e) => setField('remoteOption', e.target.value)}
              style={inputStyle(false)}
            >
              {REMOTE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldGroup>

          {/* Timezone requirements */}
          <FieldGroup label="Timezone requirements (optional)">
            <input
              type="text"
              value={form.timezoneRequirements}
              onChange={(e) => setField('timezoneRequirements', e.target.value)}
              placeholder="e.g. Must overlap 4+ hours with US ET"
              style={inputStyle(false)}
            />
          </FieldGroup>

          {/* Submit */}
          <div style={{ paddingTop: 8 }}>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || matching}
              style={{ width: '100%' }}
            >
              {submitting ? 'Posting...' : 'Post opportunity'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldGroup({
  label,
  error,
  required,
  children,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: '#E8FF47', marginLeft: 4 }}>*</span>}
      </label>
      <div style={{ marginTop: 8 }}>{children}</div>
      {error && <p style={errorStyle}>{error}</p>}
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
}

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ff6b6b',
  margin: '6px 0 0',
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    background: '#141414',
    border: `1px solid ${hasError ? '#ff6b6b' : '#2a2a2a'}`,
    borderRadius: 12,
    color: '#fff',
    fontSize: 14,
    padding: '12px 16px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }
}
