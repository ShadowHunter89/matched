import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Match, Opportunity } from '@/lib/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Button from '@/components/ui/Button'
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
  verification_status: 'none' | 'verified' | 'pro_verified' | null
  linkedin_url: string | null
}

interface ChallengeWin {
  vote_count: number
  content: string
}

interface MatchWithProfessional extends Match {
  professional_profiles: ProfessionalProfile
  profiles: { full_name: string | null }
  challengeWin?: ChallengeWin | null
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

function expiryText(createdAt: string): { text: string; color: string } | null {
  const expires = new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const daysLeft = Math.ceil((expires - now) / 86400000)
  if (daysLeft <= 0) return { text: 'Expired', color: '#555' }
  if (daysLeft === 1) return { text: 'Expires tomorrow', color: '#ff4444' }
  if (daysLeft <= 2) return { text: `Expires in ${daysLeft} days`, color: '#E8FF47' }
  if (daysLeft <= 7) return { text: `Expires in ${daysLeft} days`, color: '#666' }
  return null
}

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
  const location = useLocation()

  const [opportunities, setOpportunities] = useState<OpportunityWithCounts[]>([])
  const [selected, setSelected] = useState<OpportunityWithCounts | null>(null)
  const [matches, setMatches] = useState<MatchWithProfessional[]>([])
  const [loadingOpps, setLoadingOpps] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [stats, setStats] = useState<StatsData>({ opportunities: 0, matched: 0, interested: 0, connected: 0 })
  const [paymentMatch, setPaymentMatch] = useState<MatchWithProfessional | null>(null)
  const [connectionSuccess, setConnectionSuccess] = useState<{ email: string; professionalName: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didAutoSelect = useRef(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Handle selectedOppId from router state (e.g. after posting new opportunity)
  useEffect(() => {
    const state = location.state as { selectedOppId?: string } | null
    if (state?.selectedOppId && !didAutoSelect.current) {
      didAutoSelect.current = true
      const target = opportunities.find((o) => o.id === state.selectedOppId)
      if (target) setSelected(target)
      window.history.replaceState({}, document.title)
    }
  }, [location.state, opportunities])

  // ── Fetch opportunities
  const fetchOpportunities = useCallback(async () => {
    if (!user?.id) return
    setLoadingOpps(true)
    setError(null)

    try {
      const { data: opps, error: oppsErr } = await supabase
        .from('opportunities')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })

      if (oppsErr) throw oppsErr

      if (!opps || opps.length === 0) {
        setOpportunities([])
        setLoadingOpps(false)
        return
      }

      // Fetch match counts and all match statuses for stats
      const { data: allMatches } = await supabase
        .from('matches')
        .select('opportunity_id, status, payment_status')
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

      // Auto-select first if nothing selected yet
      if (withCounts.length > 0 && !selected) {
        // Check router state for a specific opp to select
        const state = location.state as { selectedOppId?: string } | null
        if (state?.selectedOppId && !didAutoSelect.current) {
          didAutoSelect.current = true
          const target = withCounts.find((o) => o.id === state.selectedOppId)
          if (target) {
            setSelected(target)
            window.history.replaceState({}, document.title)
          } else {
            setSelected(withCounts[0])
          }
        } else if (!didAutoSelect.current) {
          setSelected((prev) => prev || withCounts[0])
        }
      }

      // Compute stats — count as connected if status=connected OR payment_status=paid
      const totalMatched = (allMatches || []).length
      const interested = (allMatches || []).filter((m) => m.status === 'accepted').length
      const connected = (allMatches || []).filter((m) =>
        m.status === 'connected' || m.payment_status === 'paid'
      ).length
      setStats({
        opportunities: opps.length,
        matched: totalMatched,
        interested,
        connected,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load opportunities'
      setError(msg)
    } finally {
      setLoadingOpps(false)
    }
  }, [user?.id])

  // ── Fetch matches for selected opportunity
  const fetchMatches = useCallback(async (opportunityId: string) => {
    if (!opportunityId) return
    setLoadingMatches(true)

    try {
      const { data: matchData, error: matchErr } = await supabase
        .from('matches')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('similarity_score', { ascending: false })

      if (matchErr) throw matchErr

      if (!matchData || matchData.length === 0) {
        setMatches([])
        return
      }

      const profIds = matchData.map((m) => m.professional_id)

      const [{ data: profData }, { data: profileData }, { data: challengeWins }] = await Promise.all([
        supabase.from('professional_profiles').select('*').in('user_id', profIds),
        supabase.from('profiles').select('user_id, full_name').in('user_id', profIds),
        supabase
          .from('challenge_submissions')
          .select('user_id, vote_count, content, is_winner')
          .in('user_id', profIds)
          .eq('is_winner', true)
          .order('vote_count', { ascending: false }),
      ])

      const profMap = Object.fromEntries((profData || []).map((p) => [p.user_id, p]))
      const profileMap = Object.fromEntries((profileData || []).map((p) => [p.user_id, p]))
      const winsMap = Object.fromEntries((challengeWins || []).map((w) => [w.user_id, w]))

      const combined = matchData.map((m) => ({
        ...m,
        professional_profiles: profMap[m.professional_id] || null,
        profiles: profileMap[m.professional_id] || null,
        challengeWin: winsMap[m.professional_id] || null,
      }))

      setMatches(combined as MatchWithProfessional[])
    } catch (err: unknown) {
      console.error('fetchMatches error:', err)
      setMatches([])
    } finally {
      setLoadingMatches(false)
    }
  }, [])

  useEffect(() => {
    if (user?.id) fetchOpportunities()
  }, [user?.id])

  useEffect(() => {
    if (selected) {
      fetchMatches(selected.id)
    }
  }, [selected?.id])

  // ── Realtime subscription
  useEffect(() => {
    if (!user?.id || !selected?.id) return
    const channel = supabase
      .channel(`client-matches-${selected.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `opportunity_id=eq.${selected.id}`
      }, () => {
        fetchMatches(selected.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, selected?.id])

  const handlePaymentSuccess = (email: string) => {
    const professionalName = paymentMatch?.profiles?.full_name || 'the professional'
    setPaymentMatch(null)
    setConnectionSuccess({ email, professionalName })
    // Optimistically bump the connected count immediately
    setStats((prev) => ({ ...prev, connected: prev.connected + 1 }))
    // Then refresh from DB to get accurate state
    if (selected) fetchMatches(selected.id)
    fetchOpportunities()
  }

  return (
    <DashboardLayout title="Opportunities">
      <title>Opportunities · Matched</title>

      {/* Toast (for non-payment notifications) */}
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

      {/* Payment Success Overlay */}
      {connectionSuccess && (
        <ConnectionSuccessOverlay
          professionalName={connectionSuccess.professionalName}
          email={connectionSuccess.email}
          onDone={() => setConnectionSuccess(null)}
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
                <div style={{ padding: '8px 0' }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ padding: '14px 16px' }}>
                      <div style={{ background: '#1e1e1e', borderRadius: 12, height: 16, marginBottom: 8, animation: 'pulse 1.5s infinite', width: '80%' }} />
                      <div style={{ background: '#1e1e1e', borderRadius: 12, height: 12, marginBottom: 8, animation: 'pulse 1.5s infinite', width: '60%' }} />
                      <div style={{ background: '#1e1e1e', borderRadius: 12, height: 10, animation: 'pulse 1.5s infinite', width: '40%' }} />
                      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                    </div>
                  ))}
                </div>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          {opp.matchCount} matched
        </span>
        <span style={{ color: '#2a2a2a' }}>·</span>
        <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(opp.created_at)}</span>
        {(() => {
          const exp = expiryText(opp.created_at)
          return exp ? (
            <>
              <span style={{ color: '#2a2a2a' }}>·</span>
              <span style={{ fontSize: 11, color: exp.color, fontWeight: 600 }}>{exp.text}</span>
            </>
          ) : null
        })()}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, padding: 24 }}>
              <div style={{ background: '#1e1e1e', borderRadius: 12, height: 18, marginBottom: 12, animation: 'pulse 1.5s infinite', width: '50%' }} />
              <div style={{ background: '#1e1e1e', borderRadius: 12, height: 13, marginBottom: 8, animation: 'pulse 1.5s infinite', width: '70%' }} />
              <div style={{ background: '#1e1e1e', borderRadius: 12, height: 13, animation: 'pulse 1.5s infinite', width: '40%' }} />
            </div>
          ))}
        </div>
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
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid #2a2a2a',
              borderTopColor: '#E8FF47',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#888', margin: 0, fontSize: 15 }}>
            Matching in progress — Professionals have been notified. Check back in a few hours.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {matches.map((m) => (
            <ProfessionalCard
              key={m.id}
              match={m}
              clientQuestion={opportunity.client_question ?? null}
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
  clientQuestion,
  onConnect,
}: {
  match: MatchWithProfessional
  clientQuestion: string | null
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

  const isConnected = match.payment_status === 'paid' || match.status === 'connected'
  const showConnect = !isConnected && match.status === 'accepted'

  // Blind matching: show first name only until payment is made
  const displayName = isConnected
    ? (profile?.full_name || 'Professional')
    : (profile?.full_name?.split(' ')[0] || 'Professional')

  return (
    <div
      style={{
        background: '#141414',
        border: `1px solid ${match.status === 'accepted' && !isConnected ? 'rgba(232,255,71,0.25)' : '#2a2a2a'}`,
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>
              {displayName}
              {prof?.verification_status === 'verified' && (
                <span style={{ color: '#60a5fa', fontSize: 13, marginLeft: 4 }}>✓</span>
              )}
              {prof?.verification_status === 'pro_verified' && (
                <span style={{ color: '#E8FF47', fontSize: 13, marginLeft: 4 }}>✓✓</span>
              )}
              {match.challengeWin && (
                <span style={{ marginLeft: 4 }}>🏆</span>
              )}
              {!isConnected && profile?.full_name && profile.full_name.includes(' ') && (
                <span style={{ fontSize: 13, color: '#555', fontWeight: 400, marginLeft: 6 }}>· full name revealed after connecting</span>
              )}
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

      {/* Challenge win highlight */}
      {match.challengeWin && (
        <div
          style={{
            marginTop: 14,
            background: 'rgba(232,255,71,0.03)',
            border: '1px solid rgba(232,255,71,0.15)',
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🏆 Challenge Winner · {match.challengeWin.vote_count} votes
          </p>
          <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
            "{match.challengeWin.content.slice(0, 120)}{match.challengeWin.content.length > 120 ? '…' : ''}"
          </p>
        </div>
      )}

      {/* One-question interview answer */}
      {clientQuestion && match.professional_message && (
        <div
          style={{
            marginTop: 16,
            background: 'rgba(232,255,71,0.04)',
            border: '1px solid rgba(232,255,71,0.15)',
            borderRadius: 12,
            padding: '14px 16px',
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Their answer
          </p>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px', fontStyle: 'italic' }}>
            "{clientQuestion}"
          </p>
          <p style={{ fontSize: 14, color: '#ccc', margin: 0, lineHeight: 1.6 }}>
            {match.professional_message}
          </p>
        </div>
      )}

      {/* Awaiting answer notice */}
      {clientQuestion && !match.professional_message && match.status === 'pending' && (
        <div
          style={{
            marginTop: 16,
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
            Awaiting their answer to your question…
          </p>
        </div>
      )}
    </div>
  )
}

// ─── ConnectionSuccessOverlay ─────────────────────────────────────────────────

function ConnectionSuccessOverlay({
  professionalName,
  email,
  onDone,
}: {
  professionalName: string
  email: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 24,
          padding: 40,
          width: '100%',
          maxWidth: 440,
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Checkmark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(168,255,62,0.15)',
            border: '2px solid #A8FF3E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            margin: '0 auto 24px',
            color: '#A8FF3E',
          }}
        >
          ✓
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
          Payment complete!
        </h2>
        <p style={{ fontSize: 15, color: '#888', margin: '0 0 28px', lineHeight: 1.6 }}>
          You're now connected with <span style={{ color: '#fff', fontWeight: 600 }}>{professionalName}</span>.
          Reach out directly to get started.
        </p>

        {email ? (
          <>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Their email address
            </p>
            <div
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <span style={{ flex: 1, fontSize: 15, color: '#fff', fontFamily: 'monospace', textAlign: 'left' }}>
                {email}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(email)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                style={{
                  background: copied ? 'rgba(168,255,62,0.15)' : '#2a2a2a',
                  border: 'none',
                  borderRadius: 8,
                  color: copied ? '#A8FF3E' : '#888',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <a
              href={`mailto:${email}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: '#E8FF47',
                color: '#000',
                padding: '14px 24px',
                borderRadius: 100,
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
                marginBottom: 12,
              }}
            >
              Send email →
            </a>
          </>
        ) : (
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 12,
              padding: '16px',
              marginBottom: 16,
              fontSize: 14,
              color: '#888',
              lineHeight: 1.6,
            }}
          >
            ✓ Payment received. {professionalName} has been notified and will reach out to you directly. Check your email inbox.
          </div>
        )}

        <button
          onClick={onDone}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid #2a2a2a',
            borderRadius: 100,
            color: '#888',
            padding: '14px 24px',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
