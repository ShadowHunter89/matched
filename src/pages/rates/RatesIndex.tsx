import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Rate categories ──────────────────────────────────────────────────────────

interface RateRow {
  role: string
  skills: string[]
  count: number
  avgMin: number
  avgMax: number
  medianRate: number
}

const ROLE_SKILL_MAP: { role: string; skills: string[] }[] = [
  { role: 'Fractional CTO', skills: ['Engineering Leadership', 'System Architecture', 'Product Strategy'] },
  { role: 'Fractional CFO', skills: ['Financial Modeling', 'FP&A', 'Fundraising'] },
  { role: 'Fractional CMO', skills: ['Marketing', 'Growth', 'Content Strategy'] },
  { role: 'Fractional COO', skills: ['Operations', 'Sales'] },
  { role: 'Product Leader', skills: ['Product Strategy', 'UX Design'] },
  { role: 'Data & ML', skills: ['Data Analysis', 'Machine Learning'] },
  { role: 'Full-Stack Dev', skills: ['React', 'TypeScript', 'Node.js'] },
  { role: 'DevOps / Platform', skills: ['DevOps', 'Docker', 'Kubernetes', 'AWS'] },
  { role: 'Blockchain / Web3', skills: ['Blockchain', 'Web3', 'Solidity'] },
  { role: 'Design', skills: ['UX Design', 'Figma', 'Brand Design'] },
]

function timeStamp(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RatesIndex() {
  const { user, profile } = useAuthStore()
  const [rates, setRates] = useState<RateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [totalProfs, setTotalProfs] = useState(0)

  useEffect(() => {
    fetchRates()
  }, [])

  const fetchRates = async () => {
    setLoading(true)
    const { data: profs } = await supabase
      .from('professional_profiles')
      .select('skills, hourly_rate_min, hourly_rate_max')
      .eq('is_paused', false)
      .not('hourly_rate_min', 'is', null)
      .not('hourly_rate_max', 'is', null)

    if (!profs || profs.length === 0) { setLoading(false); return }

    setTotalProfs(profs.length)

    const computed: RateRow[] = ROLE_SKILL_MAP.map(({ role, skills }) => {
      const matching = profs.filter((p) =>
        skills.some((s) => (p.skills || []).includes(s))
      )
      if (matching.length === 0) return null

      const rates = matching.map((p) => ({
        min: (p.hourly_rate_min as number) / 100,
        max: (p.hourly_rate_max as number) / 100,
        mid: ((p.hourly_rate_min as number) + (p.hourly_rate_max as number)) / 200,
      }))

      const avgMin = Math.round(rates.reduce((s, r) => s + r.min, 0) / rates.length)
      const avgMax = Math.round(rates.reduce((s, r) => s + r.max, 0) / rates.length)
      const sorted = [...rates].sort((a, b) => a.mid - b.mid)
      const mid = sorted[Math.floor(sorted.length / 2)]
      const medianRate = Math.round(mid.mid)

      return { role, skills, count: matching.length, avgMin, avgMax, medianRate }
    }).filter(Boolean) as RateRow[]

    setRates(computed)
    setLoading(false)
  }

  const overallAvgMin = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r.avgMin, 0) / rates.length) : 0
  const overallAvgMax = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r.avgMax, 0) / rates.length) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#0C0C0C', color: '#fff', fontFamily: 'inherit' }}>
      {/* Nav */}
      <div style={{ borderBottom: '1px solid #2a2a2a', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ fontSize: 18, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Matched<span style={{ color: '#E8FF47' }}>·</span>
        </Link>
        {user && profile?.onboarding_complete ? (
          <Link
            to="/network"
            style={{ fontSize: 13, color: '#888', textDecoration: 'none', border: '1px solid #2a2a2a', borderRadius: 100, padding: '7px 16px' }}
          >
            ← The Network
          </Link>
        ) : (
          <Link
            to="/auth"
            style={{ fontSize: 13, color: '#E8FF47', textDecoration: 'none', border: '1px solid rgba(232,255,71,0.3)', borderRadius: 100, padding: '7px 16px' }}
          >
            Join Matched →
          </Link>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Matched Rates Index · {timeStamp()}
          </span>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: '10px 0 12px', lineHeight: 1.2 }}>
            Fractional Professional<br />Hourly Rates
          </h1>
          <p style={{ fontSize: 16, color: '#888', margin: '0 0 24px', lineHeight: 1.6, maxWidth: 520 }}>
            Real-time market rates based on {totalProfs} active professionals on the Matched platform.
            Updated continuously. No surveys, no guesses — actual posted rates.
          </p>

          {/* Summary stats */}
          {!loading && rates.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 520 }}>
              {[
                { label: 'Platform average min', value: `$${overallAvgMin}/hr` },
                { label: 'Platform average max', value: `$${overallAvgMax}/hr` },
                { label: 'Professionals tracked', value: totalProfs.toString() },
              ].map((s) => (
                <div key={s.label} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, padding: '16px 18px' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: '#555', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, height: 68, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : rates.length === 0 ? (
          <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#555', fontSize: 15 }}>Not enough data yet. Rates will appear as professionals join the platform.</p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '0 16px 10px', marginBottom: 4 }}>
              {['Role', 'Avg Min', 'Avg Max', 'Professionals'].map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rates
                .sort((a, b) => b.medianRate - a.medianRate)
                .map((r) => (
                  <RateRow key={r.role} row={r} />
                ))}
            </div>

            <p style={{ fontSize: 12, color: '#444', marginTop: 32, lineHeight: 1.6 }}>
              Rates shown are self-reported by professionals on the Matched platform and represent their preferred hourly range.
              Actual project rates may vary based on scope, engagement length, and specialization.
              Data refreshes in real-time. {timeStamp()}.
            </p>
          </>
        )}

        {/* CTA */}
        <div style={{ marginTop: 48, background: '#141414', border: '1px solid rgba(232,255,71,0.15)', borderRadius: 20, padding: 32, textAlign: 'center' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
            Looking for a fractional professional?
          </h3>
          <p style={{ fontSize: 14, color: '#888', margin: '0 0 20px' }}>
            Post your opportunity and get matched with pre-vetted professionals — no recruiters, no agencies.
          </p>
          <Link
            to={user ? '/opportunities/new' : '/auth'}
            style={{
              display: 'inline-block',
              background: '#E8FF47',
              color: '#000',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 28px',
              borderRadius: 100,
              textDecoration: 'none',
            }}
          >
            {user ? 'Post an opportunity' : 'Get started free →'}
          </Link>
        </div>
      </div>
    </div>
  )
}

function RateRow({ row }: { row: RateRow }) {
  const [hovered, setHovered] = useState(false)
  const maxBar = 400 // max $/hr for bar display
  const barWidth = Math.min((row.medianRate / maxBar) * 100, 100)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr',
        gap: 8,
        background: hovered ? '#1a1a1a' : '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: '16px',
        alignItems: 'center',
        transition: 'background 0.1s',
      }}
    >
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 2px' }}>{row.role}</p>
        <div style={{ height: 3, background: '#2a2a2a', borderRadius: 100, width: '80%', marginTop: 4 }}>
          <div style={{ height: '100%', width: `${barWidth}%`, background: '#E8FF47', borderRadius: 100, transition: 'width 0.3s' }} />
        </div>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>${row.avgMin}/hr</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#E8FF47' }}>${row.avgMax}/hr</span>
      <span style={{ fontSize: 13, color: '#888' }}>{row.count} {row.count === 1 ? 'prof' : 'profs'}</span>
    </div>
  )
}
