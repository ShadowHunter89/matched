import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import DashboardLayout from '@/components/layout/DashboardLayout'
import type { Challenge, ChallengeSubmissionEnriched } from '@/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function useCountdown(endsAt: string | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(null)

  useEffect(() => {
    if (!endsAt) return

    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0 })
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      setTimeLeft({ days, hours, minutes })
    }

    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [endsAt])

  return timeLeft
}

const card: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2a2a2a',
  borderRadius: 16,
  padding: 20,
}

const textarea: React.CSSProperties = {
  width: '100%',
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: '#fff',
  fontSize: 14,
  padding: '12px 14px',
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'vertical',
  lineHeight: 1.6,
  boxSizing: 'border-box',
}

// ─── Medal emoji helper ───────────────────────────────────────────────────────

function medal(rank: number, status: string): string {
  if (status !== 'closed') return ''
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

// ─── Countdown widget ─────────────────────────────────────────────────────────

function Countdown({ endsAt }: { endsAt: string | null }) {
  const timeLeft = useCountdown(endsAt)
  if (!timeLeft) return null
  const ended = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {ended ? (
        <span style={{ fontSize: 13, color: '#888', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 100, padding: '6px 14px' }}>
          Ended
        </span>
      ) : (
        <>
          {[
            { val: timeLeft.days, label: 'days' },
            { val: timeLeft.hours, label: 'hrs' },
            { val: timeLeft.minutes, label: 'min' },
          ].map((unit) => (
            <div key={unit.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#E8FF47', lineHeight: 1 }}>{unit.val}</div>
              <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{unit.label}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Submission card ─────────────────────────────────────────────────────────

function SubmissionCard({
  sub,
  rank,
  challengeStatus,
  onVote,
  canVote,
}: {
  sub: ChallengeSubmissionEnriched & { is_winner?: boolean }
  rank: number
  challengeStatus: string
  onVote: (id: string) => void
  canVote: boolean
}) {
  const isClosed = challengeStatus === 'closed'
  const displayName = isClosed
    ? (sub.authorName || 'Anonymous')
    : (sub.authorName?.split(' ')[0] || 'Anonymous')

  const rankMedal = medal(rank, challengeStatus)

  return (
    <div
      style={{
        ...card,
        border: sub.isOwn
          ? '1px solid rgba(232,255,71,0.25)'
          : rank <= 3 && isClosed
          ? '1px solid rgba(168,255,62,0.2)'
          : '1px solid #2a2a2a',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              {rankMedal ? `${rankMedal} ` : ''}{displayName}
            </span>
            {!isClosed && sub.authorName && sub.authorName.includes(' ') && (
              <span style={{ fontSize: 11, color: '#555' }}>· name revealed when closed</span>
            )}
            {sub.isOwn && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#E8FF47', background: 'rgba(232,255,71,0.1)', padding: '2px 8px', borderRadius: 100 }}>You</span>
            )}
          </div>
          {sub.authorHeadline && (
            <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{sub.authorHeadline}</p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: sub.isVoted ? '#E8FF47' : '#555', fontWeight: 600 }}>
            {sub.vote_count}
          </span>
          {canVote && !sub.isOwn && (
            <button
              onClick={() => onVote(sub.id)}
              style={{
                background: sub.isVoted ? 'rgba(232,255,71,0.12)' : '#1a1a1a',
                border: sub.isVoted ? '1px solid rgba(232,255,71,0.4)' : '1px solid #2a2a2a',
                borderRadius: 8,
                color: sub.isVoted ? '#E8FF47' : '#555',
                fontSize: 13,
                cursor: 'pointer',
                padding: '5px 12px',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                fontWeight: 600,
              }}
            >
              {sub.isVoted ? '▲ Voted' : '▲ Vote'}
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 14, color: '#ccc', margin: 0, lineHeight: 1.7 }}>
        {sub.content}
      </p>

      <p style={{ fontSize: 11, color: '#444', margin: '10px 0 0' }}>{timeAgo(sub.created_at)}</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ChallengesPageContent() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const isProfessional = profile?.role === 'professional'

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [submissions, setSubmissions] = useState<(ChallengeSubmissionEnriched & { is_winner?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitText, setSubmitText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: challenges } = await supabase
      .from('challenges')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!challenges || challenges.length === 0) {
      // Try closed/voting too
      const { data: anyChallenges } = await supabase
        .from('challenges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      if (!anyChallenges || anyChallenges.length === 0) {
        setLoading(false)
        return
      }
      const ch = anyChallenges[0] as Challenge
      setChallenge(ch)
      await loadSubmissions(ch)
      setLoading(false)
      return
    }

    const ch = challenges[0] as Challenge
    setChallenge(ch)
    await loadSubmissions(ch)
    setLoading(false)
  }, [user])

  const loadSubmissions = async (ch: Challenge) => {
    const { data: rawSubs } = await supabase
      .from('challenge_submissions')
      .select('*')
      .eq('challenge_id', ch.id)
      .order('vote_count', { ascending: false })

    if (!rawSubs || rawSubs.length === 0) {
      setSubmissions([])
      return
    }

    const userIds = [...new Set(rawSubs.map((s) => s.user_id))]
    const [{ data: profiles }, { data: profProfiles }, { data: myVotes }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('professional_profiles').select('user_id, headline').in('user_id', userIds),
      user
        ? supabase.from('challenge_votes').select('submission_id').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const profMap = Object.fromEntries((profProfiles || []).map((p) => [p.user_id, p]))
    const votedSet = new Set((myVotes || []).map((v: { submission_id: string }) => v.submission_id))

    setSubmissions(
      rawSubs.map((s) => ({
        ...s,
        authorName: profileMap[s.user_id]?.full_name ?? null,
        authorHeadline: profMap[s.user_id]?.headline ?? null,
        isVoted: votedSet.has(s.id),
        isOwn: s.user_id === user?.id,
        is_featured: false,
      }))
    )
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleVote = async (submissionId: string) => {
    if (!user) {
      navigate('/auth')
      return
    }
    const sub = submissions.find((s) => s.id === submissionId)
    if (!sub || sub.isOwn) return
    const wasVoted = sub.isVoted
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId
          ? { ...s, vote_count: wasVoted ? s.vote_count - 1 : s.vote_count + 1, isVoted: !wasVoted }
          : s
      )
    )
    const { error } = await supabase.rpc('toggle_challenge_vote', { p_submission_id: submissionId })
    if (error) {
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? { ...s, vote_count: wasVoted ? s.vote_count + 1 : s.vote_count - 1, isVoted: wasVoted }
            : s
        )
      )
    }
  }

  const handleSubmit = async () => {
    if (!user || !challenge) {
      navigate('/auth')
      return
    }
    if (submitText.trim().length < 50) {
      setSubmitError('Answer must be at least 50 characters.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const { error } = await supabase.from('challenge_submissions').insert({
      challenge_id: challenge.id,
      user_id: user.id,
      content: submitText.trim(),
    })
    if (error) {
      setSubmitError(error.message)
    } else {
      setSubmitText('')
      setShowSubmitForm(false)
      fetchData()
    }
    setSubmitting(false)
  }

  const alreadySubmitted = user ? submissions.some((s) => s.user_id === user.id) : false
  const isClosed = challenge?.status === 'closed'
  const canVote = !!user

  // ─── Standalone layout for logged-out users ───────────────────────────────

  const inner = (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <title>Skill Challenges · Matched</title>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
          Skill Challenges
        </h1>
        <p style={{ fontSize: 15, color: '#888', margin: 0 }}>
          Prove your expertise. Top 3 answers get a Featured badge on their profile.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...card, height: 120, animation: 'pulse 1.5s infinite' }}>
              <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>
            </div>
          ))}
        </div>
      ) : !challenge ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <p style={{ color: '#555', fontSize: 15, margin: 0 }}>No active challenge right now. Check back soon.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Challenge card */}
          <div style={{ ...card, border: '1px solid rgba(232,255,71,0.2)', background: 'rgba(232,255,71,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {challenge.category ? `${challenge.category} · ` : ''}
                    {isClosed ? 'Closed' : 'Active Challenge'}
                  </span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>
                  {challenge.title}
                </h2>
                <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7, margin: 0 }}>
                  {challenge.description}
                </p>
              </div>
              {!isClosed && (
                <div style={{ flexShrink: 0 }}>
                  <Countdown endsAt={challenge.ends_at} />
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#555' }}>
                Top 3 answers earn a <strong style={{ color: '#E8FF47' }}>Featured</strong> badge on their profile for 30 days.
              </span>
              {submissions.length > 0 && (
                <span style={{ fontSize: 12, color: '#555' }}>
                  {submissions.length} answer{submissions.length !== 1 ? 's' : ''} submitted
                </span>
              )}
            </div>
          </div>

          {/* Submit section */}
          {!user ? (
            <div style={{ ...card, textAlign: 'center', padding: 28 }}>
              <p style={{ color: '#888', margin: '0 0 16px', fontSize: 14 }}>
                Sign in to submit your answer
              </p>
              <Link
                to="/auth"
                style={{
                  display: 'inline-block',
                  background: '#E8FF47',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 28px',
                  borderRadius: 100,
                  textDecoration: 'none',
                }}
              >
                Sign in to submit
              </Link>
            </div>
          ) : isProfessional && !alreadySubmitted && !isClosed ? (
            <div>
              {!showSubmitForm ? (
                <button
                  onClick={() => setShowSubmitForm(true)}
                  style={{
                    ...card,
                    background: 'rgba(232,255,71,0.03)',
                    border: '1px dashed rgba(232,255,71,0.2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#888',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                >
                  + Submit your answer to this challenge
                </button>
              ) : (
                <div style={{ ...card, border: '1px solid rgba(232,255,71,0.2)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                    Your submission
                  </p>
                  <textarea
                    value={submitText}
                    onChange={(e) => setSubmitText(e.target.value.slice(0, 1500))}
                    placeholder="Write a thorough, specific answer. Generic advice won't stand out."
                    rows={8}
                    style={textarea}
                  />
                  {submitError && (
                    <p style={{ fontSize: 12, color: '#ff6b6b', margin: '8px 0 0' }}>{submitError}</p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: submitText.length > 1300 ? '#ff6b6b' : '#555' }}>
                      {submitText.length}/1500
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setShowSubmitForm(false); setSubmitError(null) }}
                        style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 100, color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 18px', fontFamily: 'inherit' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting || submitText.trim().length < 50}
                        style={{
                          background: submitting || submitText.trim().length < 50 ? '#2a2a2a' : '#E8FF47',
                          color: submitting || submitText.trim().length < 50 ? '#555' : '#000',
                          border: 'none',
                          borderRadius: 100,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: submitting || submitText.trim().length < 50 ? 'not-allowed' : 'pointer',
                          padding: '8px 20px',
                          fontFamily: 'inherit',
                          transition: 'all 0.15s',
                        }}
                      >
                        {submitting ? 'Submitting…' : 'Submit'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : isProfessional && alreadySubmitted ? (
            <div style={{ ...card, background: 'rgba(168,255,62,0.04)', border: '1px solid rgba(168,255,62,0.2)', textAlign: 'center' }}>
              <p style={{ color: '#A8FF3E', fontWeight: 600, fontSize: 14, margin: 0 }}>
                You've submitted an answer. Vote on others below to support the community.
              </p>
            </div>
          ) : null}

          {/* Submissions leaderboard */}
          {submissions.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                {submissions.length} submission{submissions.length !== 1 ? 's' : ''} · {isClosed ? 'final results' : 'vote for the best'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {submissions.map((sub, idx) => (
                  <SubmissionCard
                    key={sub.id}
                    sub={sub}
                    rank={idx + 1}
                    challengeStatus={challenge.status}
                    onVote={handleVote}
                    canVote={canVote}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Use DashboardLayout if logged in, standalone otherwise
  if (user) {
    return <DashboardLayout title="Challenges">{inner}</DashboardLayout>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0C0C0C', fontFamily: 'inherit' }}>
      {/* Minimal nav */}
      <nav style={{ borderBottom: '1px solid #1a1a1a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ fontSize: 18, fontWeight: 800, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
          Matched<span style={{ color: '#E8FF47' }}>.</span>
        </Link>
        <Link
          to="/auth"
          style={{ fontSize: 13, fontWeight: 600, color: '#E8FF47', textDecoration: 'none', background: 'rgba(232,255,71,0.1)', border: '1px solid rgba(232,255,71,0.2)', borderRadius: 100, padding: '6px 18px' }}
        >
          Sign in
        </Link>
      </nav>
      <div style={{ padding: '40px 24px' }}>{inner}</div>
    </div>
  )
}

export default ChallengesPageContent
