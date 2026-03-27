import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Opportunity, Match } from '@/lib/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Button from '@/components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OppRow {
  id: string
  title: string
  status: string
  created_at: string
  matched: number
  interested: number
  connected: number
  avgScore: number | null
}

interface AnalyticsStats {
  totalOpportunities: number
  totalMatched: number
  acceptanceRate: number
  connected: number
  avgMatchQuality: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'matching': return '#E8FF47'
    case 'open': return '#60a5fa'
    case 'filled': return '#A8FF3E'
    case 'closed': return '#888888'
    case 'draft': return '#444'
    default: return '#888888'
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return '#555'
  if (score > 85) return '#A8FF3E'
  if (score > 70) return '#E8FF47'
  return '#888'
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<AnalyticsStats>({
    totalOpportunities: 0,
    totalMatched: 0,
    acceptanceRate: 0,
    connected: 0,
    avgMatchQuality: 0,
  })
  const [rows, setRows] = useState<OppRow[]>([])
  const [sortKey, setSortKey] = useState<'created_at' | 'matched' | 'avgScore'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const { data: opps } = await supabase
      .from('opportunities')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (!opps || opps.length === 0) {
      setLoading(false)
      return
    }

    const oppIds = opps.map((o) => o.id)

    const { data: allMatches } = await supabase
      .from('matches')
      .select('opportunity_id, status, similarity_score')
      .in('opportunity_id', oppIds)

    const matchMap: Record<string, Match[]> = {}
    ;(allMatches || []).forEach((m: any) => {
      if (!matchMap[m.opportunity_id]) matchMap[m.opportunity_id] = []
      matchMap[m.opportunity_id].push(m)
    })

    // Build rows
    const tableRows: OppRow[] = opps.map((opp) => {
      const ms = matchMap[opp.id] || []
      const accepted = ms.filter((m) => m.status === 'accepted').length
      const connected = ms.filter((m) => m.status === 'connected').length
      const scores = ms
        .filter((m) => m.similarity_score !== null)
        .map((m) => (m.similarity_score as number) * 100)
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

      return {
        id: opp.id,
        title: opp.title,
        status: opp.status,
        created_at: opp.created_at,
        matched: ms.length,
        interested: accepted,
        connected,
        avgScore,
      }
    })

    setRows(tableRows)

    // Aggregate stats
    const allM = allMatches || []
    const totalMatched = allM.length
    const accepted = allM.filter((m: any) => m.status === 'accepted').length
    const connected = allM.filter((m: any) => m.status === 'connected').length
    const acceptanceRate = totalMatched > 0 ? Math.round((accepted / totalMatched) * 100) : 0
    const allScores = allM
      .filter((m: any) => m.similarity_score !== null)
      .map((m: any) => (m.similarity_score as number) * 100)
    const avgMatchQuality =
      allScores.length > 0
        ? Math.round(allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length)
        : 0

    setStats({
      totalOpportunities: opps.length,
      totalMatched,
      acceptanceRate,
      connected,
      avgMatchQuality,
    })

    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (user?.id) fetchData()
  }, [user?.id])

  // Sorted rows
  const sortedRows = [...rows].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'created_at') {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    } else if (sortKey === 'matched') {
      cmp = a.matched - b.matched
    } else if (sortKey === 'avgScore') {
      cmp = (a.avgScore || 0) - (b.avgScore || 0)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <DashboardLayout title="Analytics">
      <title>Analytics · Matched</title>

      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 32px' }}>
          Analytics
        </h1>

        {loading ? (
          <div style={{ color: '#888', fontSize: 15 }}>Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState onPost={() => navigate('/opportunities/new')} />
        ) : (
          <>
            {/* Stats bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
                marginBottom: 40,
              }}
            >
              {[
                { label: 'Opportunities posted', value: stats.totalOpportunities },
                { label: 'Professionals matched', value: stats.totalMatched },
                { label: 'Acceptance rate', value: `${stats.acceptanceRate}%` },
                { label: 'Connected', value: stats.connected },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: '#141414',
                    border: '1px solid #2a2a2a',
                    borderRadius: 16,
                    padding: '20px 24px',
                  }}
                >
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
                    {s.value}
                  </p>
                  <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Average match quality */}
            <div
              style={{
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 16,
                padding: 24,
                marginBottom: 40,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
                    Average match quality
                  </h3>
                  <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                    Semantic similarity between professionals and your opportunities
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: scoreColor(stats.avgMatchQuality),
                  }}
                >
                  {stats.avgMatchQuality}%
                </span>
              </div>
              <div style={{ height: 6, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${stats.avgMatchQuality}%`,
                    background: '#E8FF47',
                    borderRadius: 3,
                    transition: 'width 0.8s ease',
                  }}
                />
              </div>
            </div>

            {/* Opportunity table */}
            <div
              style={{
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2a2a' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>
                  Opportunities
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                      {[
                        { key: null, label: 'Title' },
                        { key: null, label: 'Status' },
                        { key: 'matched', label: 'Matched' },
                        { key: null, label: 'Interested' },
                        { key: null, label: 'Connected' },
                        { key: 'avgScore', label: 'Avg score' },
                        { key: 'created_at', label: 'Posted' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          onClick={() => col.key && handleSort(col.key as typeof sortKey)}
                          style={{
                            padding: '12px 16px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#888',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            textAlign: 'left',
                            cursor: col.key ? 'pointer' : 'default',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.label}
                          {col.key && sortKey === col.key && (
                            <span style={{ marginLeft: 4, opacity: 0.6 }}>
                              {sortDir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, i) => (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom:
                            i < sortedRows.length - 1 ? '1px solid #1e1e1e' : 'none',
                        }}
                      >
                        <td style={tdStyle}>
                          <span style={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>
                            {row.title}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: statusColor(row.status),
                              background: `${statusColor(row.status)}18`,
                              padding: '3px 10px',
                              borderRadius: 100,
                              textTransform: 'capitalize',
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#fff', fontWeight: 600 }}>
                          {row.matched}
                        </td>
                        <td style={{ ...tdStyle, color: '#888' }}>{row.interested}</td>
                        <td style={{ ...tdStyle, color: '#888' }}>{row.connected}</td>
                        <td style={tdStyle}>
                          {row.avgScore !== null ? (
                            <span
                              style={{
                                fontWeight: 600,
                                color: scoreColor(row.avgScore),
                                fontSize: 14,
                              }}
                            >
                              {Math.round(row.avgScore)}%
                            </span>
                          ) : (
                            <span style={{ color: '#444' }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: '#555', whiteSpace: 'nowrap' }}>
                          {fmtDate(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onPost }: { onPost: () => void }) {
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 20,
        padding: 48,
        textAlign: 'center',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          margin: '0 auto 20px',
        }}
      >
        ◈
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
        No opportunities yet
      </h2>
      <p style={{ fontSize: 14, color: '#888', margin: '0 0 24px', lineHeight: 1.6 }}>
        Post your first opportunity and we'll analyze your match data here.
      </p>
      <Button variant="primary" onClick={onPost}>
        Post opportunity
      </Button>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 14,
  color: '#888',
  verticalAlign: 'middle',
}
