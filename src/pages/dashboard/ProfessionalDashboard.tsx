import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Match, Opportunity } from '@/lib/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SkillTag from '@/components/ui/SkillTag'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchWithOpportunity extends Match {
  opportunities: Opportunity
}

interface ProfProfile {
  headline: string | null
  bio: string | null
  skills: string[]
  years_experience: number | null
  hourly_rate_min: number | null
  hourly_rate_max: number | null
  availability_hours: number | null
  timezone: string | null
  remote_preference: string | null
  preferred_industries: string[]
  embedding: string | null
}

type TabType = 'active' | 'history'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function scoreColor(score: number | null): string {
  if (!score) return '#888888'
  const pct = score * 100
  if (pct > 85) return '#A8FF3E'
  if (pct > 70) return '#E8FF47'
  return '#888888'
}

function scoreBg(score: number | null): string {
  if (!score) return '#1a1a1a'
  const pct = score * 100
  if (pct > 85) return 'rgba(168,255,62,0.12)'
  if (pct > 70) return 'rgba(232,255,71,0.12)'
  return '#1a1a1a'
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return '#E8FF47'
    case 'accepted': return '#A8FF3E'
    case 'connected': return '#A8FF3E'
    case 'declined': return '#ff6b6b'
    case 'expired': return '#888888'
    default: return '#888888'
  }
}

function calcCompleteness(profile: ProfProfile | null): number {
  if (!profile) return 0
  const fields = [
    { key: 'headline', weight: 15 },
    { key: 'bio', weight: 15 },
    { key: 'years_experience', weight: 10 },
    { key: 'hourly_rate_min', weight: 10 },
    { key: 'hourly_rate_max', weight: 10 },
    { key: 'availability_hours', weight: 10 },
    { key: 'timezone', weight: 5 },
    { key: 'remote_preference', weight: 5 },
    { key: 'preferred_industries', weight: 10 },
  ]
  const skillsScore = Math.min((profile?.skills?.length || 0) / 5, 1) * 10
  const fieldScore = fields.reduce((total, f) => {
    const val = (profile as unknown as Record<string, unknown>)[f.key]
    const filled = Array.isArray(val)
      ? val.length > 0
      : val !== null && val !== undefined && val !== ''
    return total + (filled ? f.weight : 0)
  }, 0)
  return Math.min(Math.round(fieldScore + skillsScore), 100)
}

const DECLINE_REASONS = [
  'Not a good fit',
  'Rate too low',
  'Fully booked',
  'Outside my expertise',
  'Project too short',
  'Other',
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfessionalDashboard() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<TabType>('active')
  const [matches, setMatches] = useState<MatchWithOpportunity[]>([])
  const [selected, setSelected] = useState<MatchWithOpportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [profProfile, setProfProfile] = useState<ProfProfile | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [hasNew, setHasNew] = useState(false)

  // Accept flow
  const [acceptMsg, setAcceptMsg] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [showAcceptInput, setShowAcceptInput] = useState(false)

  // Decline flow
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0])
  const [declining, setDeclining] = useState(false)
  const [showDeclineSelect, setShowDeclineSelect] = useState(false)

  // Mobile pane
  const [mobileShowDetail, setMobileShowDetail] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Fetch professional profile
  const fetchProfProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('professional_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (data) setProfProfile(data as ProfProfile)
    return data as ProfProfile | null
  }, [user])

  // ── Fetch matches
  const fetchMatches = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('matches')
      .select('*, opportunities(*)')
      .eq('professional_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setMatches(data as MatchWithOpportunity[])
    }
    setLoading(false)
  }, [user])

  // ── On mount
  useEffect(() => {
    fetchProfProfile().then(async (prof) => {
      if (prof && !prof.embedding) {
        supabase.functions.invoke('embed-professional', { body: { userId: user?.id } }).catch(() => {})
      }
    })
    fetchMatches()
  }, [fetchProfProfile, fetchMatches, user])

  // ── Realtime subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('matches-pro')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `professional_id=eq.${user.id}` },
        (payload) => {
          fetchMatches()
          if (payload.eventType === 'INSERT') {
            setHasNew(true)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, fetchMatches])

  // ── Sorted + filtered matches
  const activeMatches = matches
    .filter((m) => m.status === 'pending' || m.status === 'accepted')
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return (b.similarity_score || 0) - (a.similarity_score || 0)
    })

  const historyMatches = matches.filter(
    (m) => m.status === 'declined' || m.status === 'expired' || m.status === 'connected'
  )

  const visibleMatches = tab === 'active' ? activeMatches : historyMatches

  // ── Accept handler
  const handleAccept = async () => {
    if (!selected || !user) return
    setAccepting(true)
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          status: 'accepted',
          professional_message: acceptMsg || null,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', selected.id)

      if (error) throw error

      await supabase.functions.invoke('send-client-notification', { body: { matchId: selected.id } })
      showToast('Done! The client has been notified.')
      setShowAcceptInput(false)
      setAcceptMsg('')
      fetchMatches()
      setSelected((prev) => prev ? { ...prev, status: 'accepted' } : null)
    } catch {
      showToast('Something went wrong. Please try again.')
    } finally {
      setAccepting(false)
    }
  }

  // ── Decline handler
  const handleDecline = async () => {
    if (!selected || !user) return
    setDeclining(true)
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          status: 'declined',
          decline_reason: declineReason,
          declined_at: new Date().toISOString(),
        })
        .eq('id', selected.id)

      if (error) throw error

      showToast('Match declined.')
      setShowDeclineSelect(false)
      fetchMatches()
      setSelected(null)
    } catch {
      showToast('Something went wrong. Please try again.')
    } finally {
      setDeclining(false)
    }
  }

  const completeness = calcCompleteness(profProfile)

  return (
    <DashboardLayout title="My Matches">
      <title>Matches · Matched</title>

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

      <div
        style={{
          display: 'flex',
          height: 'calc(100vh - 64px)',
          overflow: 'hidden',
        }}
      >
        {/* ── Left Pane ── */}
        <div
          style={{
            width: 360,
            minWidth: 360,
            borderRight: '1px solid #2a2a2a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
          className="left-pane"
        >
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #2a2a2a',
              padding: '0 16px',
              gap: 0,
              flexShrink: 0,
            }}
          >
            {(['active', 'history'] as TabType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  if (t === 'active') setHasNew(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: tab === t ? '#fff' : '#888',
                  fontWeight: tab === t ? 600 : 400,
                  fontSize: 14,
                  padding: '16px 16px 14px',
                  cursor: 'pointer',
                  borderBottom: tab === t ? '2px solid #E8FF47' : '2px solid transparent',
                  position: 'relative',
                  textTransform: 'capitalize',
                }}
              >
                {t}
                {t === 'active' && hasNew && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 8,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#E8FF47',
                    }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Match List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: '8px 0' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ background: '#1e1e1e', borderRadius: 12, height: 16, animation: 'pulse 1.5s infinite', width: '65%' }} />
                      <div style={{ background: '#1e1e1e', borderRadius: 12, height: 16, animation: 'pulse 1.5s infinite', width: '20%' }} />
                    </div>
                    <div style={{ background: '#1e1e1e', borderRadius: 12, height: 12, animation: 'pulse 1.5s infinite', width: '40%' }} />
                    <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                  </div>
                ))}
              </div>
            ) : visibleMatches.length === 0 ? (
              <EmptyState tab={tab} completeness={completeness} />
            ) : (
              visibleMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isSelected={selected?.id === m.id}
                  onClick={() => {
                    setSelected(m)
                    setShowAcceptInput(false)
                    setShowDeclineSelect(false)
                    setMobileShowDetail(true)
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right Pane ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!selected ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#888',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 32,
                }}
              >
                ⬡
              </div>
              <p style={{ fontSize: 15, color: '#888', margin: 0 }}>
                Select a match to view details
              </p>
            </div>
          ) : (
            <OpportunityDetail
              match={selected}
              showAcceptInput={showAcceptInput}
              setShowAcceptInput={setShowAcceptInput}
              acceptMsg={acceptMsg}
              setAcceptMsg={setAcceptMsg}
              accepting={accepting}
              onAccept={handleAccept}
              showDeclineSelect={showDeclineSelect}
              setShowDeclineSelect={setShowDeclineSelect}
              declineReason={declineReason}
              setDeclineReason={setDeclineReason}
              declining={declining}
              onDecline={handleDecline}
            />
          )}
        </div>
      </div>

      {/* Mobile responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .left-pane {
            width: 100% !important;
            min-width: 100% !important;
            display: ${mobileShowDetail ? 'none' : 'flex'} !important;
          }
        }
      `}</style>
    </DashboardLayout>
  )
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  isSelected,
  onClick,
}: {
  match: MatchWithOpportunity
  isSelected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const pct = match.similarity_score ? Math.round(match.similarity_score * 100) : null

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
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {match.opportunities?.title || 'Untitled Opportunity'}
        </p>
        {pct !== null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: scoreColor(match.similarity_score),
              background: scoreBg(match.similarity_score),
              padding: '2px 8px',
              borderRadius: 100,
              flexShrink: 0,
            }}
          >
            {pct}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: statusColor(match.status),
            background: `${statusColor(match.status)}18`,
            padding: '2px 8px',
            borderRadius: 100,
            textTransform: 'capitalize',
          }}
        >
          {match.status}
        </span>
        <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(match.created_at)}</span>
      </div>
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ tab, completeness }: { tab: TabType; completeness: number }) {
  return (
    <div style={{ padding: 24 }}>
      {tab === 'active' ? (
        <>
          <p style={{ color: '#888', fontSize: 14, margin: '0 0 16px' }}>
            Your profile is live. New matches will appear here.
          </p>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#888' }}>Profile completeness</span>
              <span style={{ fontSize: 12, color: completeness >= 80 ? '#A8FF3E' : '#E8FF47' }}>
                {completeness}%
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: '#2a2a2a',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${completeness}%`,
                  background: completeness >= 80 ? '#A8FF3E' : '#E8FF47',
                  borderRadius: 2,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            {completeness < 80 && (
              <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
                Complete your profile to improve match quality.
              </p>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: '#888', fontSize: 14, margin: 0 }}>No history yet.</p>
      )}
    </div>
  )
}

// ─── OpportunityDetail ────────────────────────────────────────────────────────

interface DetailProps {
  match: MatchWithOpportunity
  showAcceptInput: boolean
  setShowAcceptInput: (v: boolean) => void
  acceptMsg: string
  setAcceptMsg: (v: string) => void
  accepting: boolean
  onAccept: () => void
  showDeclineSelect: boolean
  setShowDeclineSelect: (v: boolean) => void
  declineReason: string
  setDeclineReason: (v: string) => void
  declining: boolean
  onDecline: () => void
}

function OpportunityDetail({
  match,
  showAcceptInput,
  setShowAcceptInput,
  acceptMsg,
  setAcceptMsg,
  accepting,
  onAccept,
  showDeclineSelect,
  setShowDeclineSelect,
  declineReason,
  setDeclineReason,
  declining,
  onDecline,
}: DetailProps) {
  const opp = match.opportunities
  const pct = match.similarity_score ? Math.round(match.similarity_score * 100) : null

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      {/* Title */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
        {opp?.title || 'Untitled Opportunity'}
      </h1>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: statusColor(match.status),
            background: `${statusColor(match.status)}18`,
            padding: '4px 12px',
            borderRadius: 100,
            textTransform: 'capitalize',
          }}
        >
          {match.status}
        </span>
        {pct !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: scoreColor(match.similarity_score),
              background: scoreBg(match.similarity_score),
              padding: '4px 12px',
              borderRadius: 100,
            }}
          >
            {pct}% match
          </span>
        )}
      </div>

      {/* Description */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
          About this opportunity
        </h2>
        <p style={{ color: '#ccc', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          {opp?.description || 'No description provided.'}
        </p>
      </section>

      {/* Meta grid */}
      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          {opp?.budget_min && opp?.budget_max && (
            <MetaCard label="Budget" value={`$${opp.budget_min / 100}–$${opp.budget_max / 100}/hr`} />
          )}
          {opp?.hours_per_week && (
            <MetaCard label="Hours per week" value={`${opp.hours_per_week} hrs`} />
          )}
          {opp?.duration_weeks && (
            <MetaCard label="Duration" value={`${opp.duration_weeks} weeks`} />
          )}
          {opp?.remote_option && (
            <MetaCard label="Remote" value={opp.remote_option.replace(/_/g, ' ')} />
          )}
        </div>
      </section>

      {/* Skills */}
      {opp?.required_skills && opp.required_skills.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Required skills
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {opp.required_skills.map((skill) => (
              <SkillTag key={skill} skill={skill} />
            ))}
          </div>
        </section>
      )}

      {/* Action area */}
      <div
        style={{
          borderTop: '1px solid #2a2a2a',
          paddingTop: 24,
        }}
      >
        {match.status === 'pending' && (
          <>
            {/* Accept */}
            {!showAcceptInput && !showDeclineSelect && (
              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  variant="primary"
                  onClick={() => setShowAcceptInput(true)}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeclineSelect(true)}
                >
                  Decline
                </Button>
              </div>
            )}

            {showAcceptInput && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 13, color: '#888' }}>
                  Add a personal message (optional)
                </label>
                <textarea
                  value={acceptMsg}
                  onChange={(e) => setAcceptMsg(e.target.value)}
                  placeholder="Introduce yourself or note why you're a great fit..."
                  rows={4}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 14,
                    padding: '12px 16px',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.6,
                  }}
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <Button
                    variant="primary"
                    onClick={onAccept}
                    disabled={accepting}
                  >
                    {accepting ? 'Sending...' : 'Confirm & Accept'}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAcceptInput(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {showDeclineSelect && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 13, color: '#888' }}>Reason for declining</label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 14,
                    padding: '12px 16px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {DECLINE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Button
                    variant="ghost"
                    onClick={onDecline}
                    disabled={declining}
                    style={{ borderColor: '#ff6b6b', color: '#ff6b6b' }}
                  >
                    {declining ? 'Declining...' : 'Confirm Decline'}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDeclineSelect(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {match.status === 'accepted' && (
          <StatusPill color="#A8FF3E" label="Waiting for client" />
        )}

        {match.status === 'declined' && (
          <div>
            <StatusPill color="#ff6b6b" label="Declined" />
            {(match as any).decline_reason && (
              <p style={{ fontSize: 13, color: '#555', marginTop: 8 }}>
                Reason: {(match as any).decline_reason}
              </p>
            )}
          </div>
        )}

        {match.status === 'connected' && (
          <StatusPill color="#A8FF3E" label="Connected" />
        )}

        {match.status === 'expired' && (
          <StatusPill color="#888" label="Expired" />
        )}
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
        {label}
      </p>
      <p style={{ fontSize: 15, color: '#fff', fontWeight: 600, margin: 0 }}>
        {value}
      </p>
    </div>
  )
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 14,
        fontWeight: 600,
        color,
        background: `${color}18`,
        padding: '8px 16px',
        borderRadius: 100,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}
