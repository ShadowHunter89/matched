import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Professional {
  user_id: string
  headline: string
  skills: string[]
  hourly_rate_min: number | null
  hourly_rate_max: number | null
  has_embedding: boolean
  full_name: string
}

interface Opportunity {
  id: string
  title: string
  skills_required: string[]
  budget_min: number | null
  budget_max: number | null
  status: string
  created_at: string
  client_name: string
}

interface Match {
  opportunity_id: string
  professional_id: string
  score: number
  status: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.85) return '#E8FF47'   // lime — excellent
  if (score >= 0.70) return '#86efac'   // green — good
  if (score >= 0.55) return '#fbbf24'   // amber — fair
  return '#f87171'                       // red — poor
}

function scoreBg(score: number): string {
  if (score >= 0.85) return 'rgba(232,255,71,0.12)'
  if (score >= 0.70) return 'rgba(134,239,172,0.10)'
  if (score >= 0.55) return 'rgba(251,191,36,0.10)'
  return 'rgba(248,113,113,0.10)'
}

function formatRate(min: number | null, max: number | null) {
  if (!min && !max) return '—'
  if (min && max) return `$${min}–$${max}/hr`
  return `$${min || max}/hr`
}

function formatBudget(min: number | null, max: number | null) {
  if (!min && !max) return '—'
  if (min && max) return `$${min.toLocaleString()}–$${max.toLocaleString()}`
  return `$${(min || max)?.toLocaleString()}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Validation() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [matches, setMatches] = useState<Match[]>([])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 1. Professionals + names
      const [{ data: profData, error: profErr }, { data: nameData, error: nameErr }] =
        await Promise.all([
          supabase
            .from('professional_profiles')
            .select('user_id, headline, skills, hourly_rate_min, hourly_rate_max, embedding'),
          supabase.from('profiles').select('user_id, full_name'),
        ])

      if (profErr) throw new Error(`professional_profiles: ${profErr.message}`)
      if (nameErr) throw new Error(`profiles: ${nameErr.message}`)

      const nameMap: Record<string, string> = {}
      for (const p of nameData || []) nameMap[p.user_id] = p.full_name || 'Unknown'

      const profs: Professional[] = (profData || []).map((p) => ({
        user_id: p.user_id,
        headline: p.headline || '—',
        skills: p.skills || [],
        hourly_rate_min: p.hourly_rate_min,
        hourly_rate_max: p.hourly_rate_max,
        has_embedding: p.embedding !== null,
        full_name: nameMap[p.user_id] || 'Unknown',
      }))
      setProfessionals(profs)

      // 2. Opportunities + client names
      const { data: oppData, error: oppErr } = await supabase
        .from('opportunities')
        .select('id, title, skills_required, budget_min, budget_max, status, created_at, client_id')
        .order('created_at', { ascending: false })

      if (oppErr) throw new Error(`opportunities: ${oppErr.message}`)

      const clientIds = [...new Set((oppData || []).map((o) => o.client_id))]
      const { data: clientNames } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', clientIds)

      const clientMap: Record<string, string> = {}
      for (const c of clientNames || []) clientMap[c.user_id] = c.full_name || 'Client'

      const opps: Opportunity[] = (oppData || []).map((o) => ({
        id: o.id,
        title: o.title,
        skills_required: o.skills_required || [],
        budget_min: o.budget_min,
        budget_max: o.budget_max,
        status: o.status,
        created_at: o.created_at,
        client_name: clientMap[o.client_id] || 'Unknown',
      }))
      setOpportunities(opps)

      // 3. All matches
      const { data: matchData, error: matchErr } = await supabase
        .from('matches')
        .select('opportunity_id, professional_id, score, status')

      if (matchErr) throw new Error(`matches: ${matchErr.message}`)
      setMatches(matchData || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) { navigate('/auth'); return }
    fetchAll()
  }, [user, fetchAll, navigate])

  // ── Build score lookup: { [oppId]: { [profId]: Match } } ──────────────────
  const scoreMap: Record<string, Record<string, Match>> = {}
  for (const m of matches) {
    if (!scoreMap[m.opportunity_id]) scoreMap[m.opportunity_id] = {}
    scoreMap[m.opportunity_id][m.professional_id] = m
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalMatches = matches.length
  const connectedMatches = matches.filter((m) => m.status === 'connected').length
  const avgScore =
    matches.length > 0
      ? (matches.reduce((s, m) => s + (m.score || 0), 0) / matches.length).toFixed(2)
      : '—'
  const profsWithEmbedding = professionals.filter((p) => p.has_embedding).length

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen p-8"
        style={{ backgroundColor: '#0C0C0C', color: '#E5E5E5' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="h-8 w-64 rounded-lg mb-2 animate-pulse" style={{ background: '#1A1A1A' }} />
          <div className="h-4 w-48 rounded mb-8 animate-pulse" style={{ background: '#1A1A1A' }} />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl mb-4 animate-pulse" style={{ background: '#1A1A1A' }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className="min-h-screen p-8 flex items-center justify-center"
        style={{ backgroundColor: '#0C0C0C' }}
      >
        <div
          className="rounded-2xl p-8 max-w-lg w-full text-center"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
        >
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-white mb-2">Data load failed</h2>
          <p className="text-sm mb-6" style={{ color: '#888' }}>{error}</p>
          <button
            onClick={fetchAll}
            className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: '#E8FF47', color: '#0C0C0C' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen p-6 md:p-8"
      style={{ backgroundColor: '#0C0C0C', color: '#E5E5E5' }}
    >
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                to="/admin/diagnostics"
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: '#888' }}
              >
                ← Diagnostics
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white">Match Validation</h1>
            <p className="text-sm mt-1" style={{ color: '#888' }}>
              All professionals × opportunities with match scores from the database
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#E5E5E5' }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Professionals', value: professionals.length, sub: `${profsWithEmbedding} with embeddings` },
            { label: 'Opportunities', value: opportunities.length, sub: `${opportunities.filter(o => o.status === 'open').length} open` },
            { label: 'Total Matches', value: totalMatches, sub: `${connectedMatches} connected` },
            { label: 'Avg Score', value: avgScore, sub: 'across all matches' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-4"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
            >
              <div className="text-2xl font-bold" style={{ color: '#E8FF47' }}>{s.value}</div>
              <div className="text-sm font-medium text-white mt-1">{s.label}</div>
              <div className="text-xs mt-0.5" style={{ color: '#666' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Score legend ── */}
        <div
          className="rounded-xl p-4 flex flex-wrap gap-4 items-center"
          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
        >
          <span className="text-xs font-medium" style={{ color: '#888' }}>Score legend:</span>
          {[
            { color: '#E8FF47', bg: 'rgba(232,255,71,0.12)', label: '≥ 85% Excellent' },
            { color: '#86efac', bg: 'rgba(134,239,172,0.10)', label: '70–84% Good' },
            { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', label: '55–69% Fair' },
            { color: '#f87171', bg: 'rgba(248,113,113,0.10)', label: '< 55% Poor' },
          ].map((l) => (
            <span
              key={l.label}
              className="text-xs px-3 py-1 rounded-full font-medium"
              style={{ color: l.color, background: l.bg }}
            >
              {l.label}
            </span>
          ))}
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: '#555', background: '#111' }}>
            — No match
          </span>
        </div>

        {/* ── Match matrix ── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Match Score Matrix</h2>
          {opportunities.length === 0 || professionals.length === 0 ? (
            <div
              className="rounded-xl p-10 text-center"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
            >
              <div className="text-3xl mb-3">📭</div>
              <p className="text-sm" style={{ color: '#888' }}>
                {professionals.length === 0
                  ? 'No professionals yet — visit /admin/seed to create test data.'
                  : 'No opportunities yet — post one from the client dashboard.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2A2A2A' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#141414' }}>
                    {/* Corner cell */}
                    <th
                      className="sticky left-0 z-10 px-4 py-3 text-left font-medium"
                      style={{
                        color: '#888',
                        background: '#141414',
                        borderBottom: '1px solid #2A2A2A',
                        borderRight: '1px solid #2A2A2A',
                        minWidth: '200px',
                      }}
                    >
                      Professional ↓ / Opportunity →
                    </th>
                    {opportunities.map((opp) => (
                      <th
                        key={opp.id}
                        className="px-4 py-3 text-left font-medium"
                        style={{
                          color: '#CCC',
                          borderBottom: '1px solid #2A2A2A',
                          borderRight: '1px solid #1A1A1A',
                          minWidth: '180px',
                          verticalAlign: 'top',
                        }}
                      >
                        <div className="font-semibold text-white truncate max-w-[160px]" title={opp.title}>
                          {opp.title}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: '#666' }}>
                          {opp.client_name} · {timeAgo(opp.created_at)}
                        </div>
                        <div className="mt-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              color: opp.status === 'open' ? '#E8FF47' : '#888',
                              background: opp.status === 'open' ? 'rgba(232,255,71,0.1)' : '#1E1E1E',
                            }}
                          >
                            {opp.status}
                          </span>
                        </div>
                        {opp.skills_required.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {opp.skills_required.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: '#1E1E1E', color: '#888' }}
                              >
                                {s}
                              </span>
                            ))}
                            {opp.skills_required.length > 3 && (
                              <span className="text-xs" style={{ color: '#555' }}>
                                +{opp.skills_required.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {professionals.map((prof, idx) => (
                    <tr
                      key={prof.user_id}
                      style={{ background: idx % 2 === 0 ? '#0F0F0F' : '#111111' }}
                    >
                      {/* Professional name column */}
                      <td
                        className="sticky left-0 z-10 px-4 py-3"
                        style={{
                          background: idx % 2 === 0 ? '#0F0F0F' : '#111111',
                          borderRight: '1px solid #2A2A2A',
                          borderBottom: '1px solid #1A1A1A',
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div>
                            <div className="font-medium text-white">{prof.full_name}</div>
                            <div className="text-xs truncate max-w-[150px]" style={{ color: '#888' }} title={prof.headline}>
                              {prof.headline}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs" style={{ color: '#666' }}>
                                {formatRate(prof.hourly_rate_min, prof.hourly_rate_max)}
                              </span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  color: prof.has_embedding ? '#86efac' : '#f87171',
                                  background: prof.has_embedding ? 'rgba(134,239,172,0.1)' : 'rgba(248,113,113,0.1)',
                                }}
                              >
                                {prof.has_embedding ? '⬢ vec' : '✕ no vec'}
                              </span>
                            </div>
                            {prof.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {prof.skills.slice(0, 3).map((s) => (
                                  <span
                                    key={s}
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{ background: '#1E1E1E', color: '#777' }}
                                  >
                                    {s}
                                  </span>
                                ))}
                                {prof.skills.length > 3 && (
                                  <span className="text-xs" style={{ color: '#555' }}>
                                    +{prof.skills.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Score cells */}
                      {opportunities.map((opp) => {
                        const match = scoreMap[opp.id]?.[prof.user_id]
                        return (
                          <td
                            key={opp.id}
                            className="px-4 py-3 text-center"
                            style={{
                              borderRight: '1px solid #1A1A1A',
                              borderBottom: '1px solid #1A1A1A',
                            }}
                          >
                            {match ? (
                              <div
                                className="inline-flex flex-col items-center gap-1 rounded-lg px-3 py-2"
                                style={{ background: scoreBg(match.score) }}
                              >
                                <span
                                  className="text-lg font-bold tabular-nums"
                                  style={{ color: scoreColor(match.score) }}
                                >
                                  {Math.round(match.score * 100)}%
                                </span>
                                <span
                                  className="text-xs"
                                  style={{ color: match.status === 'connected' ? '#86efac' : '#666' }}
                                >
                                  {match.status}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#333' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Professionals table ── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            All Professionals
            <span className="ml-2 text-sm font-normal" style={{ color: '#666' }}>
              ({professionals.length})
            </span>
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2A2A2A' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#141414' }}>
                  {['Name', 'Headline', 'Skills', 'Rate', 'Embedding'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: '#888', borderBottom: '1px solid #2A2A2A' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {professionals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#666' }}>
                      No professionals — visit <Link to="/admin/seed" className="underline" style={{ color: '#E8FF47' }}>/admin/seed</Link>
                    </td>
                  </tr>
                ) : (
                  professionals.map((p, i) => (
                    <tr
                      key={p.user_id}
                      style={{
                        background: i % 2 === 0 ? '#0F0F0F' : '#111111',
                        borderBottom: '1px solid #1A1A1A',
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-white">{p.full_name}</td>
                      <td className="px-4 py-3" style={{ color: '#AAA', maxWidth: '200px' }}>
                        <span className="block truncate" title={p.headline}>{p.headline}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.skills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ background: '#1E1E1E', color: '#AAA' }}
                            >
                              {s}
                            </span>
                          ))}
                          {p.skills.length > 4 && (
                            <span className="text-xs" style={{ color: '#555' }}>+{p.skills.length - 4}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: '#AAA' }}>
                        {formatRate(p.hourly_rate_min, p.hourly_rate_max)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-1 rounded-full font-medium"
                          style={{
                            color: p.has_embedding ? '#86efac' : '#f87171',
                            background: p.has_embedding ? 'rgba(134,239,172,0.1)' : 'rgba(248,113,113,0.1)',
                          }}
                        >
                          {p.has_embedding ? '✓ Yes' : '✕ Missing'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Opportunities table ── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            All Opportunities
            <span className="ml-2 text-sm font-normal" style={{ color: '#666' }}>
              ({opportunities.length})
            </span>
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2A2A2A' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#141414' }}>
                  {['Title', 'Client', 'Skills Required', 'Budget', 'Status', 'Posted', 'Matches'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: '#888', borderBottom: '1px solid #2A2A2A' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#666' }}>
                      No opportunities yet — post one from the client dashboard
                    </td>
                  </tr>
                ) : (
                  opportunities.map((opp, i) => {
                    const oppMatches = matches.filter((m) => m.opportunity_id === opp.id)
                    const bestScore = oppMatches.length > 0
                      ? Math.max(...oppMatches.map((m) => m.score))
                      : null

                    return (
                      <tr
                        key={opp.id}
                        style={{
                          background: i % 2 === 0 ? '#0F0F0F' : '#111111',
                          borderBottom: '1px solid #1A1A1A',
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-white max-w-[180px]">
                          <span className="block truncate" title={opp.title}>{opp.title}</span>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#AAA' }}>{opp.client_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {opp.skills_required.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ background: '#1E1E1E', color: '#AAA' }}
                              >
                                {s}
                              </span>
                            ))}
                            {opp.skills_required.length > 3 && (
                              <span className="text-xs" style={{ color: '#555' }}>+{opp.skills_required.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: '#AAA' }}>
                          {formatBudget(opp.budget_min, opp.budget_max)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs px-2 py-1 rounded-full font-medium"
                            style={{
                              color: opp.status === 'open' ? '#E8FF47' : '#888',
                              background: opp.status === 'open' ? 'rgba(232,255,71,0.1)' : '#1E1E1E',
                            }}
                          >
                            {opp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {timeAgo(opp.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {oppMatches.length === 0 ? (
                            <span style={{ color: '#444' }}>None</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{oppMatches.length}</span>
                              {bestScore !== null && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ color: scoreColor(bestScore), background: scoreBg(bestScore) }}
                                >
                                  best {Math.round(bestScore * 100)}%
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Raw matches table ── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            All Matches (raw)
            <span className="ml-2 text-sm font-normal" style={{ color: '#666' }}>
              ({matches.length})
            </span>
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2A2A2A' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#141414' }}>
                  {['Professional', 'Opportunity', 'Score', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-medium"
                      style={{ color: '#888', borderBottom: '1px solid #2A2A2A' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#666' }}>
                      No matches yet — post an opportunity and click "Find Matches"
                    </td>
                  </tr>
                ) : (
                  [...matches]
                    .sort((a, b) => b.score - a.score)
                    .map((m, i) => {
                      const profName = professionals.find((p) => p.user_id === m.professional_id)?.full_name || m.professional_id.slice(0, 8) + '…'
                      const oppTitle = opportunities.find((o) => o.id === m.opportunity_id)?.title || m.opportunity_id.slice(0, 8) + '…'
                      return (
                        <tr
                          key={`${m.opportunity_id}-${m.professional_id}`}
                          style={{
                            background: i % 2 === 0 ? '#0F0F0F' : '#111111',
                            borderBottom: '1px solid #1A1A1A',
                          }}
                        >
                          <td className="px-4 py-3 font-medium text-white">{profName}</td>
                          <td className="px-4 py-3 max-w-[200px]" style={{ color: '#AAA' }}>
                            <span className="block truncate" title={oppTitle}>{oppTitle}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-sm font-bold tabular-nums px-2 py-1 rounded"
                              style={{ color: scoreColor(m.score), background: scoreBg(m.score) }}
                            >
                              {Math.round(m.score * 100)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-xs px-2 py-1 rounded-full"
                              style={{
                                color: m.status === 'connected' ? '#86efac'
                                  : m.status === 'pending' ? '#fbbf24'
                                  : '#888',
                                background: m.status === 'connected' ? 'rgba(134,239,172,0.1)'
                                  : m.status === 'pending' ? 'rgba(251,191,36,0.1)'
                                  : '#1E1E1E',
                              }}
                            >
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Footer nav ── */}
        <div className="flex gap-4 text-sm pb-8" style={{ color: '#555' }}>
          <Link to="/admin/diagnostics" className="hover:text-white transition-colors">Diagnostics</Link>
          <Link to="/admin/seed" className="hover:text-white transition-colors">Seed Data</Link>
          <Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
        </div>

      </div>
    </div>
  )
}
