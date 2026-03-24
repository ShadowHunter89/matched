import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Match, Opportunity } from '@/lib/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SkillTag from '@/components/ui/SkillTag'
import PaymentDialog from '@/components/PaymentDialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfessionalProfile {
  user_id: string
  headline: string | null
  bio: string | null
  skills: string[]
  years_experience: number | null
  hourly_rate_min: number | null
  hourly_rate_max: number | null
  availability_hours: number | null
  remote_preference: string | null
}

interface MatchWithProfessional extends Match {
  professional_profiles: ProfessionalProfile
  profiles: { full_name: string | null }
}

interface OpportunityWithCounts extends Opportunity {
  matchCount: number
}

interface StatsData {
  opportunities: number
  matched: number
  interested: number
  connected: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'matching': return '#E8FF47'
    case 'open': return '#60a5fa'
    case 'filled': return '#A8FF3E'
    case 'closed': return '#888888'
    case 'draft': return '#555555'
    default: return '#888888'
  }
}

function scoreColor(score: number | null): string {
  if (!score) return '#888888'
  const pct = score * 100
  if (pct > 85) return '#A8FF3E'
  if (pct > 70) return '#E8FF47'
  return '#888888'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [opportunities, setOpportunities] = useState<OpportunityWithCounts[]>([])
  const [selected, setSelected] = useState<OpportunityWithCounts | null>(null)
  const [matches, setMatches] = useState<MatchWithProfessional[]>([])
  const [loadingOpps, setLoadingOpps] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [stats, setStats] = useState<StatsData>({ opportunities: 0, matched: 0, interested: 0, connected: 0 })
  const [paymentMatch, setPaymentMatch] = useState<MatchWithProfessional | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [profCount, setProfCount] = useState(0)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Fetch opportunities
  const fetchOpportunities = useCallback(async () => {
    if (!user) return
    setLoadingOpps(true)

    const { data: opps } = await supabase
      .from('opportunities')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (!opps) { setLoadingOpps(false); return }

    // Fetch match counts
    const { data: allMatches } = await supabase
      .from('matches')
      .select('opportunity_id, status')
      .in('opportunity_id', opps.map((o) => o.id))

    const countMap: Record<string, number> = {}
    ;(allMatches || []).forEach((m) => {
      countMap[m.opportunity_id] = (countMap[m.opportunity_id] || 0) + 1
    })

    const withCounts: OpportunityWithCounts[] = opps.map((o) => ({
      ...o,
      matchCount: countMap[o.id] || 0,
    }))

    setOpportunities(withCounts)

    // Compute stats
    const totalMatched = (allMatches || []).length
    const interested = (allMatches || []).filter((m) => m.status === 'accepted').length
    const connected = (allMatches || []).filter((m) => m.status === 'connected').length
    setStats({
      opportunities: opps.length,
      matched: totalMatched,
      interested,
      connected,
    })

    setLoadingOpps(false)
  }, [user])

  // ── fetchData: unified refresh
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoadingOpps(true);
    console.log("Fetching for client:", user.id);
    const { data: opps, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    console.log("Opps:", opps?.length, error?.message);
    if (opps && opps.length > 0) {
      const oppIds = opps.map(o => o.id);
      const { data: allMatches } = await supabase
        .from("matches")
        .select(`
          *,
          profiles:professional_id (full_name),
          professional_profiles:professional_id (
            headline, skills, hourly_rate_min,
            hourly_rate_max, availability_hours
          )
        `)
        .in("opportunity_id", oppIds)
        .order("similarity_score", { ascending: false });
      const m = allMatches || [];
      const withCounts: OpportunityWithCounts[] = opps.map(o => ({
        ...o,
        matchCount: m.filter(x => x.opportunity_id === o.id).length,
      }));
      setOpportunities(withCounts);
      setStats({
        opportunities: opps.length,
        matched: m.length,
        interested: m.filter(x => x.status === "accepted").length,
        connected: m.filter(x => x.status === "connected").length,
      });
      if (selected) {
        setMatches((m.filter(x => x.opportunity_id === selected.id) as MatchWithProfessional[]));
      }
    } else {
      setOpportunities((opps || []).map(o => ({ ...o, matchCount: 0 })));
      setStats({ opportunities: 0, matched: 0, interested: 0, connected: 0 });
    }
    const { count } = await supabase
      .from("professional_profiles")
      .select("*", { count: "exact", head: true });
    setProfCount(count || 0);
    setLoadingOpps(false);
  }, [user, selected])

  // ── Fetch matches for selected opportunity
  const fetchMatches = useCallback(async (opportunityId: string) => {
    setLoadingMatches(true)

    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('similarity_score', { ascending: false })

    if (!matchData || matchData.length === 0) {
      setMatches([])
      setLoadingMatches(false)
      return
    }

    const profIds = matchData.map((m) => m.professional_id)

    const [{ data: profData }, { data: profileData }] = await Promise.all([
      supabase.from('professional_profiles').select('*').in('user_id', profIds),
      supabase.from('profiles').select('user_id, full_name').in('user_id', profIds),
    ])

    const profMap = Object.fromEntries((profData || []).map((p) => [p.user_id, p]))
    const profileMap = Object.fromEntries((profileData || []).map((p) => [p.user_id, p]))

    const combined = matchData.map((m) => ({
      ...m,
      professional_profiles: profMap[m.professional_id] || null,
      profiles: profileMap[m.professional_id] || null,
    }))

    setMatches(combined as MatchWithProfessional[])
    setLoadingMatches(false)
  }, [])

  useEffect(() => {
    fetchOpportunities()
  }, [fetchOpportunities])

  useEffect(() => {
    if (selected) {
      fetchMatches(selected.id)
    }
  }, [selected, fetchMatches])

  const handlePaymentSuccess = (email: string) => {
    showToast(`Connected! Email: ${email}`)
    setPaymentMatch(null)
    if (selected) fetchMatches(selected.id)
    fetchOpportunities()
  }

  return (
    <DashboardLayout title="Opportunities">
      <title>Opportunities · Matched</title>

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
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}

      {/* Payment Dialog */}
      {paymentMatch && (
        <PaymentDialog
          matchId={paymentMatch.id}
          professionalName={paymentMatch.profiles?.full_name || 'Professional'}
          professionalHeadline={paymentMatch.professional_profiles?.headline || null}
          opportunityTitle={selected?.title || ''}
          onClose={() => setPaymentMatch(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
        {/* Stats bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            padding: '20px 24px',
            borderBottom: '1px solid #2a2a2a',
            flexShrink: 0,
          }}
        >
          {[
            { label: 'Opportunities', value: stats.opportunities },
            { label: 'Matched', value: stats.matched },
            { label: 'Interested', value: stats.interested },
            { label: 'Connected', value: stats.connected },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 16,
                padding: '16px 20px',
              }}
            >
              <p style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
                {s.value}
              </p>
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Two-pane layout */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Opportunity list */}
          <div
            style={{
              width: 340,
              minWidth: 340,
              borderRight: '1px solid #2a2a2a',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            {/* Post button */}
            <div style={{ padding: '16px 16px 8px' }}>
              <Button
                variant="primary"
                onClick={() => navigate('/opportunities/new')}
                style={{ width: '100%' }}
              >
                + Post new opportunity
              </Button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
              {loadingOpps ? (
                <div style={{ padding: 24, color: '#888', fontSize: 14 }}>Loading...</div>
              ) : opportunities.length === 0 ? (
                <OpportunityEmptyState />
              ) : (
                opportunities.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    isSelected={selected?.id === opp.id}
                    onClick={() => setSelected(opp)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: Matched professionals */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selected ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#555',
                  fontSize: 15,
                }}
              >
                Select an opportunity to view matched professionals
              </div>
            ) : (
              <MatchedProfessionalsList
                opportunity={selected}
                matches={matches}
                loading={loadingMatches}
                onConnect={setPaymentMatch}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// ─── OpportunityCard ──────────────────────────────────────────────────────────

function OpportunityCard({
  opp,
  isSelected,
  onClick,
}: {
  opp: OpportunityWithCounts
  isSelected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 16px',
        cursor: 'pointer',
        borderLeft: isSelected ? '2px solid #E8FF47' : '2px solid transparent',
        background: isSelected ? '#1c1c1c' : hovered ? '#181818' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff', flex: 1 }}>
          {opp.title}
        </p>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: statusColor(opp.status),
            background: `${statusColor(opp.status)}18`,
            padding: '2px 8px',
            borderRadius: 100,
            flexShrink: 0,
            textTransform: 'capitalize',
          }}
        >
          {opp.status}
        </span>
      </div>

      {opp.description && (
        <div style={{ marginTop: 8 }}>
          <p
            style={{
              fontSize: 12,
              color: '#666',
              margin: 0,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: 'vertical',
              overflow: expanded ? 'visible' : 'hidden',
            }}
          >
            {opp.description}
          </p>
          {opp.description.length > 100 && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
              style={{
                background: 'none',
                border: 'none',
                color: '#E8FF47',
                fontSize: 11,
                cursor: 'pointer',
                padding: '2px 0',
                fontFamily: 'inherit',
              }}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          {opp.matchCount} matched
        </span>
        <span style={{ color: '#2a2a2a' }}>·</span>
        <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(opp.created_at)}</span>
      </div>
    </div>
  )
}

// ─── OpportunityEmptyState ────────────────────────────────────────────────────

function OpportunityEmptyState() {
  const navigate = useNavigate()
  return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#888', fontSize: 14, margin: '0 0 16px' }}>No opportunities yet.</p>
      <p style={{ color: '#555', fontSize: 12, margin: '0 0 16px' }}>
        Post your first opportunity and we'll match you with pre-vetted professionals.
      </p>
      <Button variant="ghost" onClick={() => navigate('/opportunities/new')}>
        Post opportunity
      </Button>
    </div>
  )
}

// ─── MatchedProfessionalsList ─────────────────────────────────────────────────

function MatchedProfessionalsList({
  opportunity,
  matches,
  loading,
  onConnect,
}: {
  opportunity: OpportunityWithCounts
  matches: MatchWithProfessional[]
  loading: boolean
  onConnect: (match: MatchWithProfessional) => void
}) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
          {opportunity.title}
        </h2>
        <p style={{ fontSize: 14, color: '#888', margin: 0 }}>
          {matches.length} professional{matches.length !== 1 ? 's' : ''} matched
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#888', fontSize: 14 }}>Loading matches...</div>
      ) : matches.length === 0 ? (
        <div
          style={{
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#888', margin: 0, fontSize: 15 }}>
            No matches yet. We're analyzing your opportunity.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {matches.map((m) => (
            <ProfessionalCard
              key={m.id}
              match={m}
              onConnect={() => onConnect(m)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ProfessionalCard ─────────────────────────────────────────────────────────

function ProfessionalCard({
  match,
  onConnect,
}: {
  match: MatchWithProfessional
  onConnect: () => void
}) {
  const prof = match.professional_profiles
  const profile = match.profiles
  const pct = match.similarity_score ? Math.round(match.similarity_score * 100) : null
  const color = scoreColor(match.similarity_score)

  const allSkills = prof?.skills || []
  const visibleSkills = allSkills.slice(0, 5)
  const extraCount = allSkills.length - 5

  const rateMin = prof?.hourly_rate_min ? Math.round(prof.hourly_rate_min / 100) : null
  const rateMax = prof?.hourly_rate_max ? Math.round(prof.hourly_rate_max / 100) : null

  const showConnect = match.status === 'accepted' && match.payment_status === 'unpaid'
  const isConnected = match.payment_status === 'paid' || match.status === 'connected'

  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>
              {profile?.full_name || 'Professional'}
            </p>
            {pct !== null && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color,
                  background: `${color}15`,
                  padding: '2px 10px',
                  borderRadius: 100,
                }}
              >
                {pct}% match
              </span>
            )}
          </div>
          {prof?.headline && (
            <p style={{ fontSize: 14, color: '#888', margin: 0 }}>{prof.headline}</p>
          )}
        </div>

        {/* Action */}
        {isConnected ? (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#A8FF3E',
              background: 'rgba(168,255,62,0.12)',
              padding: '6px 14px',
              borderRadius: 100,
              flexShrink: 0,
            }}
          >
            Connected
          </span>
        ) : showConnect ? (
          <Button variant="primary" onClick={onConnect} style={{ flexShrink: 0 }}>
            Connect
          </Button>
        ) : (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: match.status === 'pending' ? '#E8FF47' : '#888',
              background: match.status === 'pending' ? 'rgba(232,255,71,0.1)' : '#1a1a1a',
              padding: '6px 14px',
              borderRadius: 100,
              flexShrink: 0,
              textTransform: 'capitalize',
            }}
          >
            {match.status}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        {rateMin && rateMax && (
          <span style={{ fontSize: 13, color: '#888' }}>${rateMin}–${rateMax}/hr</span>
        )}
        {prof?.availability_hours && (
          <span style={{ fontSize: 13, color: '#888' }}>{prof.availability_hours} hrs/wk</span>
        )}
        {prof?.remote_preference && (
          <span style={{ fontSize: 13, color: '#555' }}>
            {prof.remote_preference.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Skills */}
      {visibleSkills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {visibleSkills.map((skill) => (
            <SkillTag key={skill} skill={skill} />
          ))}
          {extraCount > 0 && (
            <span
              style={{
                fontSize: 12,
                color: '#555',
                padding: '4px 10px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: 100,
              }}
            >
              +{extraCount} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
