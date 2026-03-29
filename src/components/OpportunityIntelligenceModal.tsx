import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Opportunity } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  matchingCount: number
  avgRateMin: number
  avgRateMax: number
  budgetStatus: 'competitive' | 'low' | 'very_low' | 'unknown'
  responseEstimate: string
  suggestions: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeSuggestions(opp: Opportunity, report: Omit<ReportData, 'suggestions'>): string[] {
  const suggestions: string[] = []

  if (!opp.description || opp.description.length < 100)
    suggestions.push('Add a more detailed description — professionals are more likely to accept when they understand the context and what success looks like.')

  if ((opp.required_skills || []).length < 3)
    suggestions.push('Add more required skills. Listings with 3+ skills get significantly better match quality.')

  if (report.budgetStatus === 'low')
    suggestions.push(`Your budget ($${opp.budget_max ? Math.round(opp.budget_max / 100) : '—'}/hr) is below the market average of $${report.avgRateMax}/hr for this role. Consider increasing it to attract more professionals.`)

  if (report.budgetStatus === 'very_low')
    suggestions.push(`Your budget is well below market rates ($${report.avgRateMax}/hr avg). You may receive fewer responses. Even a modest increase will open access to more professionals.`)

  if (!opp.hours_per_week)
    suggestions.push('Specify your weekly hours commitment — professionals need this to assess availability fit.')

  if (!opp.timezone_requirements && opp.remote_option !== 'onsite_only')
    suggestions.push('If timezone overlap matters, add it — professionals filter by this when accepting matches.')

  if (!opp.client_question)
    suggestions.push('Add a screening question to your listing. It filters for professionals who give thoughtful responses and shows seriousness.')

  return suggestions.slice(0, 3)
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  opportunity: Opportunity
  onProceed: () => void
}

export default function OpportunityIntelligenceModal({ opportunity, onProceed }: Props) {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReport()
  }, [])

  const fetchReport = async () => {
    try {
      // Find professionals with overlapping skills, not paused, with rates set
      const { data: allProfs } = await supabase
        .from('professional_profiles')
        .select('user_id, skills, hourly_rate_min, hourly_rate_max')
        .eq('is_paused', false)

      const requiredSkills = opportunity.required_skills || []

      // Any skill overlap counts as a potential match
      const matching = (allProfs || []).filter((p) =>
        requiredSkills.length === 0 || requiredSkills.some((s) => (p.skills || []).includes(s))
      )

      const withRates = matching.filter((p) => p.hourly_rate_min && p.hourly_rate_max)

      let avgRateMin = 0
      let avgRateMax = 0
      if (withRates.length > 0) {
        avgRateMin = Math.round(withRates.reduce((s, p) => s + p.hourly_rate_min / 100, 0) / withRates.length)
        avgRateMax = Math.round(withRates.reduce((s, p) => s + p.hourly_rate_max / 100, 0) / withRates.length)
      }

      // Budget benchmark
      let budgetStatus: ReportData['budgetStatus'] = 'unknown'
      if (opportunity.budget_max && avgRateMax > 0) {
        const oppMax = opportunity.budget_max / 100
        if (oppMax >= avgRateMax * 0.9) budgetStatus = 'competitive'
        else if (oppMax >= avgRateMax * 0.65) budgetStatus = 'low'
        else budgetStatus = 'very_low'
      } else if (opportunity.budget_max && avgRateMax === 0) {
        budgetStatus = 'unknown'
      }

      // Response time estimate
      let responseEstimate: string
      if (matching.length >= 15) responseEstimate = 'Typically 12–24 hours'
      else if (matching.length >= 6) responseEstimate = 'Typically 24–48 hours'
      else if (matching.length >= 2) responseEstimate = 'Typically 48–72 hours'
      else responseEstimate = '3–5 days — consider broadening your requirements'

      const base = { matchingCount: matching.length, avgRateMin, avgRateMax, budgetStatus, responseEstimate }
      const suggestions = computeSuggestions(opportunity, base)

      setReport({ ...base, suggestions })
    } catch {
      // If fetch fails, still show modal with minimal data
      setReport({
        matchingCount: 0,
        avgRateMin: 0,
        avgRateMax: 0,
        budgetStatus: 'unknown',
        responseEstimate: '24–48 hours',
        suggestions: [],
      })
    } finally {
      setLoading(false)
    }
  }

  const budgetLabel = {
    competitive: { text: 'Competitive budget', color: '#A8FF3E', bg: 'rgba(168,255,62,0.1)', border: 'rgba(168,255,62,0.2)' },
    low: { text: 'Below market rate', color: '#E8FF47', bg: 'rgba(232,255,71,0.08)', border: 'rgba(232,255,71,0.2)' },
    very_low: { text: 'Well below market', color: '#ff9966', bg: 'rgba(255,100,68,0.08)', border: 'rgba(255,100,68,0.2)' },
    unknown: { text: 'No budget set', color: '#888', bg: '#1a1a1a', border: '#2a2a2a' },
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 24,
          padding: 36,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Opportunity Intelligence Report
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '8px 0 4px' }}>
            {opportunity.title}
          </h2>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Here's what the platform data says about your listing.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #2a2a2a', borderTopColor: '#E8FF47', borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto 12px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#888', fontSize: 13 }}>Analyzing professional pool…</p>
          </div>
        ) : report && (
          <>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <StatBox
                label="Matching professionals"
                value={report.matchingCount.toString()}
                sub={report.matchingCount === 1 ? 'professional on platform' : 'professionals on platform'}
                color={report.matchingCount >= 5 ? '#A8FF3E' : report.matchingCount >= 2 ? '#E8FF47' : '#ff6b6b'}
              />
              <StatBox
                label="Market rate range"
                value={report.avgRateMax > 0 ? `$${report.avgRateMin}–$${report.avgRateMax}/hr` : 'No data yet'}
                sub="avg for matched skill set"
                color="#fff"
              />
              <StatBox
                label="Budget benchmark"
                value={budgetLabel[report.budgetStatus].text}
                sub={opportunity.budget_max ? `vs $${Math.round(opportunity.budget_max / 100)}/hr you posted` : 'no budget specified'}
                color={budgetLabel[report.budgetStatus].color}
                bg={budgetLabel[report.budgetStatus].bg}
                border={budgetLabel[report.budgetStatus].border}
              />
              <StatBox
                label="Estimated first response"
                value={report.responseEstimate}
                sub="based on current availability"
                color="#60a5fa"
              />
            </div>

            {/* Suggestions */}
            {report.suggestions.length > 0 && (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>
                  {report.suggestions.length} way{report.suggestions.length !== 1 ? 's' : ''} to improve your listing
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {report.suggestions.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#E8FF47', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                      <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, margin: 0 }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={onProceed}
              style={{
                width: '100%',
                background: '#E8FF47',
                color: '#000',
                border: 'none',
                borderRadius: 100,
                padding: '16px 24px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Start matching →
            </button>
            <p style={{ fontSize: 12, color: '#444', textAlign: 'center', margin: '12px 0 0' }}>
              Professionals will be notified. You'll see responses on your dashboard.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  sub,
  color,
  bg = '#1a1a1a',
  border = '#2a2a2a',
}: {
  label: string
  value: string
  sub: string
  color: string
  bg?: string
  border?: string
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '16px' }}>
      <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color, margin: '0 0 4px', lineHeight: 1.3 }}>{value}</p>
      <p style={{ fontSize: 11, color: '#555', margin: 0 }}>{sub}</p>
    </div>
  )
}
