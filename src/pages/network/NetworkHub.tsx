import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import SkillTag from '@/components/ui/SkillTag'
import Button from '@/components/ui/Button'
import type {
  NetworkPostEnriched,
  NetworkAnswerEnriched,
  AvailabilityPostEnriched,
  Challenge,
  ChallengeSubmissionEnriched,
} from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Anytime'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysLeft(dateStr: string | null): string | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days <= 0) return 'Ended'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

const input: React.CSSProperties = {
  width: '100%',
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  color: '#fff',
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type Tab = 'wall' | 'ask' | 'available' | 'challenges'

const TAB_LABELS: Record<Tab, string> = {
  wall: 'Knowledge Wall',
  ask: 'Ask the Network',
  available: 'Availability',
  challenges: 'Challenges',
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function NetworkHub() {
  const [tab, setTab] = useState<Tab>('wall')
  const { profile } = useAuthStore()
  const isProfessional = profile?.role === 'professional'

  return (
    <DashboardLayout title="The Network">
      <title>The Network · Matched</title>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>The Network</h1>
              <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
                Knowledge · Questions · Talent · Challenges
              </p>
            </div>
            <Link
              to="/rates"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#E8FF47',
                background: 'rgba(232,255,71,0.08)',
                border: '1px solid rgba(232,255,71,0.2)',
                borderRadius: 100,
                padding: '7px 16px',
                textDecoration: 'none',
              }}
            >
              Rates Index ↗
            </Link>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 20, borderBottom: '1px solid #2a2a2a', paddingBottom: 0 }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid #E8FF47' : '2px solid transparent',
                  color: tab === t ? '#fff' : '#555',
                  fontSize: 13,
                  fontWeight: tab === t ? 700 : 500,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginBottom: -1,
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {tab === 'wall' && <KnowledgeWallTab isProfessional={isProfessional} />}
        {tab === 'ask' && <AskNetworkTab isProfessional={isProfessional} />}
        {tab === 'available' && <AvailabilityBoardTab isProfessional={isProfessional} />}
        {tab === 'challenges' && <ChallengesTab isProfessional={isProfessional} />}
      </div>
    </DashboardLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Knowledge Wall
// ─────────────────────────────────────────────────────────────────────────────

function KnowledgeWallTab({ isProfessional }: { isProfessional: boolean }) {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<NetworkPostEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const { data: rawPosts } = await supabase
      .from('network_posts')
      .select('*')
      .eq('type', 'insight')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!rawPosts || rawPosts.length === 0) { setPosts([]); setLoading(false); return }

    const userIds = [...new Set(rawPosts.map((p) => p.user_id))]
    const [{ data: profiles }, { data: profProfiles }, { data: myLikes }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('professional_profiles').select('user_id, headline, skills').in('user_id', userIds),
      user ? supabase.from('network_post_likes').select('post_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const profMap = Object.fromEntries((profProfiles || []).map((p) => [p.user_id, p]))
    const likedSet = new Set((myLikes || []).map((l: { post_id: string }) => l.post_id))

    setPosts(rawPosts.map((p) => ({
      ...p,
      authorName: profileMap[p.user_id]?.full_name ?? null,
      authorHeadline: profMap[p.user_id]?.headline ?? null,
      authorSkills: profMap[p.user_id]?.skills ?? [],
      isLiked: likedSet.has(p.id),
    })))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const handleLike = async (postId: string) => {
    if (!user) return
    const post = posts.find((p) => p.id === postId)
    if (!post) return
    const wasLiked = post.isLiked
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, like_count: wasLiked ? p.like_count - 1 : p.like_count + 1, isLiked: !wasLiked } : p
    ))
    const { error } = await supabase.rpc('toggle_post_like', { p_post_id: postId })
    if (error) {
      setPosts((prev) => prev.map((p) =>
        p.id === postId ? { ...p, like_count: wasLiked ? p.like_count + 1 : p.like_count - 1, isLiked: wasLiked } : p
      ))
    }
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags((prev) => [...prev, t])
    }
    setTagInput('')
  }

  const handleSubmit = async () => {
    if (!user || content.trim().length < 20) return
    setSubmitting(true)
    const { error } = await supabase.from('network_posts').insert({
      user_id: user.id,
      type: 'insight',
      content: content.trim(),
      tags,
    })
    if (!error) {
      setContent('')
      setTags([])
      setShowForm(false)
      fetchPosts()
    }
    setSubmitting(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Create button / form */}
      {isProfessional && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            ...card,
            background: 'rgba(232,255,71,0.04)',
            border: '1px dashed rgba(232,255,71,0.2)',
            cursor: 'pointer',
            textAlign: 'left',
            color: '#888',
            fontSize: 14,
            fontFamily: 'inherit',
            width: '100%',
          }}
        >
          + Share an insight with the network…
        </button>
      )}

      {isProfessional && showForm && (
        <div style={{ ...card, border: '1px solid rgba(232,255,71,0.2)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
            Share an insight
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 1000))}
            placeholder="Share real expertise — a lesson learned, a framework that works, a mistake to avoid…"
            rows={5}
            style={textarea}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: content.length > 900 ? '#ff6b6b' : '#555' }}>{content.length}/1000</span>
          </div>

          {/* Tags */}
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{ fontSize: 12, color: '#E8FF47', background: 'rgba(232,255,71,0.1)', border: '1px solid rgba(232,255,71,0.2)', borderRadius: 100, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                #{t}
                <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: 12, fontFamily: 'inherit' }}>×</button>
              </span>
            ))}
            {tags.length < 5 && (
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
                placeholder="+ add tag"
                style={{ ...input, width: 100, fontSize: 12, padding: '4px 8px' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting || content.trim().length < 20}>
              {submitting ? 'Posting…' : 'Post insight'}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setContent(''); setTags([]) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <LoadingSkeleton />
      ) : posts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#555', fontSize: 15, margin: 0 }}>
            No insights yet. {isProfessional ? 'Be the first to share.' : 'Check back soon.'}
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <InsightCard key={post.id} post={post} userId={user?.id ?? null} onLike={handleLike} />
        ))
      )}
    </div>
  )
}

function InsightCard({
  post,
  userId,
  onLike,
}: {
  post: NetworkPostEnriched
  userId: string | null
  onLike: (id: string) => void
}) {
  return (
    <div style={card}>
      {/* Author */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>
            {post.authorName || 'Anonymous'}
          </p>
          {post.authorHeadline && (
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{post.authorHeadline}</p>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#555', flexShrink: 0, marginLeft: 12 }}>{timeAgo(post.created_at)}</span>
      </div>

      {/* Content */}
      <p style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>
        {post.content}
      </p>

      {/* Tags */}
      {post.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {post.tags.map((t) => (
            <span key={t} style={{ fontSize: 11, color: '#888', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 100, padding: '2px 10px' }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Like */}
      <button
        onClick={() => userId && onLike(post.id)}
        style={{
          background: post.isLiked ? 'rgba(232,255,71,0.1)' : 'transparent',
          border: `1px solid ${post.isLiked ? 'rgba(232,255,71,0.3)' : '#2a2a2a'}`,
          borderRadius: 100,
          color: post.isLiked ? '#E8FF47' : '#555',
          fontSize: 12,
          fontWeight: 600,
          padding: '5px 12px',
          cursor: userId ? 'pointer' : 'default',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.15s',
        }}
      >
        ♥ {post.like_count}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Ask the Network
// ─────────────────────────────────────────────────────────────────────────────

function AskNetworkTab({ isProfessional }: { isProfessional: boolean }) {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<NetworkPostEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const { data: rawPosts } = await supabase
      .from('network_posts')
      .select('*')
      .eq('type', 'question')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!rawPosts || rawPosts.length === 0) { setPosts([]); setLoading(false); return }

    const userIds = [...new Set(rawPosts.map((p) => p.user_id))]
    const [{ data: profiles }, { data: myLikes }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      user ? supabase.from('network_post_likes').select('post_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const likedSet = new Set((myLikes || []).map((l: { post_id: string }) => l.post_id))

    setPosts(rawPosts.map((p) => ({
      ...p,
      authorName: profileMap[p.user_id]?.full_name ?? null,
      authorHeadline: null,
      authorSkills: [],
      isLiked: likedSet.has(p.id),
    })))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const handleLike = async (postId: string) => {
    if (!user) return
    const post = posts.find((p) => p.id === postId)
    if (!post) return
    const wasLiked = post.isLiked
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, like_count: wasLiked ? p.like_count - 1 : p.like_count + 1, isLiked: !wasLiked } : p
    ))
    const { error } = await supabase.rpc('toggle_post_like', { p_post_id: postId })
    if (error) {
      setPosts((prev) => prev.map((p) =>
        p.id === postId ? { ...p, like_count: wasLiked ? p.like_count + 1 : p.like_count - 1, isLiked: wasLiked } : p
      ))
    }
  }

  const handleSubmit = async () => {
    if (!user || content.trim().length < 20) return
    setSubmitting(true)
    const { error } = await supabase.from('network_posts').insert({
      user_id: user.id,
      type: 'question',
      content: content.trim(),
      tags: [],
    })
    if (!error) {
      setContent('')
      setShowForm(false)
      fetchPosts()
    }
    setSubmitting(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ask button / form */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            ...card,
            background: 'rgba(96,165,250,0.04)',
            border: '1px dashed rgba(96,165,250,0.25)',
            cursor: 'pointer',
            textAlign: 'left',
            color: '#888',
            fontSize: 14,
            fontFamily: 'inherit',
            width: '100%',
          }}
        >
          + Ask the network a question…
        </button>
      )}

      {showForm && (
        <div style={{ ...card, border: '1px solid rgba(96,165,250,0.25)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
            Your question
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 500))}
            placeholder="Ask a specific business question — fractional experts will answer…"
            rows={4}
            style={textarea}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting || content.trim().length < 20}>
              {submitting ? 'Posting…' : 'Post question'}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setContent('') }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <LoadingSkeleton />
      ) : posts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#555', fontSize: 15, margin: 0 }}>No questions yet. Ask something the network can help with.</p>
        </div>
      ) : (
        posts.map((post) => (
          <QuestionCard
            key={post.id}
            post={post}
            userId={user?.id ?? null}
            isProfessional={isProfessional}
            isExpanded={expanded === post.id}
            onToggle={() => setExpanded((prev) => (prev === post.id ? null : post.id))}
            onLike={handleLike}
          />
        ))
      )}
    </div>
  )
}

function QuestionCard({
  post,
  userId,
  isProfessional,
  isExpanded,
  onToggle,
  onLike,
}: {
  post: NetworkPostEnriched
  userId: string | null
  isProfessional: boolean
  isExpanded: boolean
  onToggle: () => void
  onLike: (id: string) => void
}) {
  const [answers, setAnswers] = useState<NetworkAnswerEnriched[]>([])
  const [loadingAnswers, setLoadingAnswers] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const didFetch = useRef(false)

  useEffect(() => {
    if (!isExpanded || didFetch.current) return
    didFetch.current = true
    fetchAnswers()
  }, [isExpanded])

  const fetchAnswers = async () => {
    setLoadingAnswers(true)
    const { data: rawAnswers } = await supabase
      .from('network_answers')
      .select('*')
      .eq('post_id', post.id)
      .order('like_count', { ascending: false })

    if (!rawAnswers || rawAnswers.length === 0) { setAnswers([]); setLoadingAnswers(false); return }

    const userIds = [...new Set(rawAnswers.map((a) => a.user_id))]
    const [{ data: profiles }, { data: profProfiles }, { data: myLikes }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('professional_profiles').select('user_id, headline').in('user_id', userIds),
      userId ? supabase.from('network_answer_likes').select('answer_id').eq('user_id', userId) : Promise.resolve({ data: [] }),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const profMap = Object.fromEntries((profProfiles || []).map((p) => [p.user_id, p]))
    const likedSet = new Set((myLikes || []).map((l: { answer_id: string }) => l.answer_id))

    setAnswers(rawAnswers.map((a) => ({
      ...a,
      authorName: profileMap[a.user_id]?.full_name ?? null,
      authorHeadline: profMap[a.user_id]?.headline ?? null,
      isLiked: likedSet.has(a.id),
    })))
    setLoadingAnswers(false)
  }

  const handleAnswerLike = async (answerId: string) => {
    if (!userId) return
    const answer = answers.find((a) => a.id === answerId)
    if (!answer) return
    const wasLiked = answer.isLiked
    setAnswers((prev) => prev.map((a) =>
      a.id === answerId ? { ...a, like_count: wasLiked ? a.like_count - 1 : a.like_count + 1, isLiked: !wasLiked } : a
    ))
    const { error } = await supabase.rpc('toggle_answer_like', { p_answer_id: answerId })
    if (error) {
      setAnswers((prev) => prev.map((a) =>
        a.id === answerId ? { ...a, like_count: wasLiked ? a.like_count + 1 : a.like_count - 1, isLiked: wasLiked } : a
      ))
    }
  }

  const submitAnswer = async () => {
    if (!userId || answerText.trim().length < 10) return
    setSubmitting(true)
    const { error } = await supabase.from('network_answers').insert({
      post_id: post.id,
      user_id: userId,
      content: answerText.trim(),
    })
    if (!error) {
      setAnswerText('')
      didFetch.current = false
      fetchAnswers()
    }
    setSubmitting(false)
  }

  const alreadyAnswered = userId ? answers.some((a) => a.user_id === userId) : false

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{post.authorName || 'Anonymous'}</p>
          <span style={{ fontSize: 11, color: '#555' }}>{timeAgo(post.created_at)}</span>
        </div>
        <span style={{ fontSize: 12, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 100, padding: '3px 10px', flexShrink: 0 }}>
          Question
        </span>
      </div>

      <p style={{ fontSize: 15, color: '#fff', fontWeight: 500, lineHeight: 1.6, margin: '0 0 14px' }}>{post.content}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => userId && onLike(post.id)}
          style={{
            background: post.isLiked ? 'rgba(232,255,71,0.1)' : 'transparent',
            border: `1px solid ${post.isLiked ? 'rgba(232,255,71,0.3)' : '#2a2a2a'}`,
            borderRadius: 100,
            color: post.isLiked ? '#E8FF47' : '#555',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            cursor: userId ? 'pointer' : 'default',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          ♥ {post.like_count}
        </button>
        <button
          onClick={onToggle}
          style={{
            background: 'transparent',
            border: '1px solid #2a2a2a',
            borderRadius: 100,
            color: '#888',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isExpanded ? 'Hide answers' : `${answers.length > 0 ? answers.length + ' ' : ''}Answer${answers.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {isExpanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid #2a2a2a', paddingTop: 16 }}>
          {loadingAnswers ? (
            <p style={{ color: '#555', fontSize: 13 }}>Loading answers…</p>
          ) : answers.length === 0 ? (
            <p style={{ color: '#555', fontSize: 13, margin: '0 0 16px' }}>No answers yet. {isProfessional ? 'Be the first.' : ''}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {answers.map((a) => (
                <div key={a.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{a.authorName || 'Anonymous'}</span>
                      {a.authorHeadline && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{a.authorHeadline}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: '#555' }}>{timeAgo(a.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 14, color: '#ddd', lineHeight: 1.6, margin: '0 0 10px' }}>{a.content}</p>
                  <button
                    onClick={() => handleAnswerLike(a.id)}
                    style={{
                      background: a.isLiked ? 'rgba(232,255,71,0.1)' : 'transparent',
                      border: `1px solid ${a.isLiked ? 'rgba(232,255,71,0.3)' : '#333'}`,
                      borderRadius: 100,
                      color: a.isLiked ? '#E8FF47' : '#555',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ♥ {a.like_count}
                  </button>
                </div>
              ))}
            </div>
          )}

          {isProfessional && !alreadyAnswered && (
            <div>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value.slice(0, 800))}
                placeholder="Share your expertise…"
                rows={3}
                style={textarea}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#555' }}>{answerText.length}/800</span>
                <Button variant="primary" onClick={submitAnswer} disabled={submitting || answerText.trim().length < 10}>
                  {submitting ? 'Posting…' : 'Post answer'}
                </Button>
              </div>
            </div>
          )}
          {isProfessional && alreadyAnswered && (
            <p style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>You've already answered this question.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Availability Board
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_SUGGESTIONS_AVAIL = [
  'React', 'TypeScript', 'Node.js', 'Python', 'Engineering Leadership', 'Financial Modeling',
  'FP&A', 'Fundraising', 'Product Strategy', 'UX Design', 'Data Analysis', 'Machine Learning',
  'Marketing', 'Sales', 'Operations', 'Growth', 'System Architecture', 'DevOps',
]

function AvailabilityBoardTab({ isProfessional }: { isProfessional: boolean }) {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<AvailabilityPostEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [myPost, setMyPost] = useState<AvailabilityPostEnriched | null>(null)
  const [formHours, setFormHours] = useState('')
  const [formFrom, setFormFrom] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formSkills, setFormSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const { data: raw } = await supabase
      .from('availability_posts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(40)

    if (!raw || raw.length === 0) { setPosts([]); setLoading(false); return }

    const userIds = [...new Set(raw.map((p) => p.user_id))]
    const [{ data: profiles }, { data: profProfiles }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('professional_profiles').select('user_id, headline').in('user_id', userIds),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const profMap = Object.fromEntries((profProfiles || []).map((p) => [p.user_id, p]))

    const enriched = raw.map((p) => ({
      ...p,
      authorName: profileMap[p.user_id]?.full_name ?? null,
      authorHeadline: profMap[p.user_id]?.headline ?? null,
    }))

    setPosts(enriched)
    if (user) {
      setMyPost(enriched.find((p) => p.user_id === user.id) ?? null)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const addSkill = (s: string) => {
    const t = s.trim()
    if (t && !formSkills.includes(t) && formSkills.length < 8) {
      setFormSkills((prev) => [...prev, t])
    }
    setSkillInput('')
  }

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true)
    // Deactivate any existing post
    await supabase.from('availability_posts').update({ is_active: false }).eq('user_id', user.id)
    // Create new post
    await supabase.from('availability_posts').insert({
      user_id: user.id,
      hours_per_week: formHours ? parseInt(formHours) : null,
      available_from: formFrom || null,
      description: formDesc.trim() || null,
      skills: formSkills,
      is_active: true,
    })
    setShowForm(false)
    setFormHours(''); setFormFrom(''); setFormDesc(''); setFormSkills([])
    fetchPosts()
    setSubmitting(false)
  }

  const handleDeactivate = async () => {
    if (!user || !myPost) return
    await supabase.from('availability_posts').update({ is_active: false }).eq('id', myPost.id)
    setMyPost(null)
    fetchPosts()
  }

  const skillSuggestions = SKILL_SUGGESTIONS_AVAIL.filter(
    (s) => s.toLowerCase().includes(skillInput.toLowerCase()) && !formSkills.includes(s)
  ).slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Professional controls */}
      {isProfessional && (
        <div style={{ ...card, background: myPost ? 'rgba(168,255,62,0.04)' : '#141414', border: myPost ? '1px solid rgba(168,255,62,0.2)' : '1px solid #2a2a2a' }}>
          {myPost && !showForm ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#A8FF3E', margin: 0 }}>Your availability is posted</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowForm(true)} style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: 8, color: '#888', fontSize: 12, cursor: 'pointer', padding: '5px 12px', fontFamily: 'inherit' }}>Edit</button>
                  <button onClick={handleDeactivate} style={{ background: 'none', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 12, cursor: 'pointer', padding: '5px 12px', fontFamily: 'inherit' }}>Remove</button>
                </div>
              </div>
              {myPost.hours_per_week && <p style={{ fontSize: 13, color: '#888', margin: '0 0 4px' }}>{myPost.hours_per_week} hrs/wk · from {formatDate(myPost.available_from)}</p>}
              {myPost.description && <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{myPost.description}</p>}
            </div>
          ) : !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', padding: 0 }}
            >
              + Post your availability — let clients find you
            </button>
          ) : null}

          {showForm && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#A8FF3E', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>
                {myPost ? 'Update your availability' : 'Post your availability'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Hours/week</p>
                  <input type="number" value={formHours} onChange={(e) => setFormHours(e.target.value)} placeholder="e.g. 10" min={1} max={40} style={input} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Available from</p>
                  <input type="date" value={formFrom} onChange={(e) => setFormFrom(e.target.value)} style={input} />
                </div>
              </div>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value.slice(0, 400))}
                placeholder="Briefly describe your focus and what kind of work you're looking for…"
                rows={3}
                style={{ ...textarea, marginBottom: 12 }}
              />
              {/* Skills */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {formSkills.map((s) => (
                    <span key={s} style={{ fontSize: 12, color: '#fff', background: '#252525', border: '1px solid #3a3a3a', borderRadius: 100, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s}
                      <button onClick={() => setFormSkills((prev) => prev.filter((x) => x !== s))} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: 12, fontFamily: 'inherit' }}>×</button>
                    </span>
                  ))}
                  <input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillInput) } }}
                    placeholder="+ skill"
                    style={{ ...input, width: 90, fontSize: 12, padding: '4px 8px' }}
                  />
                </div>
                {skillSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {skillSuggestions.map((s) => (
                      <button key={s} onClick={() => addSkill(s)} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 100, color: '#888', fontSize: 11, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>+ {s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Board */}
      {loading ? (
        <LoadingSkeleton />
      ) : posts.filter((p) => !isProfessional || p.user_id !== user?.id).length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#555', fontSize: 15, margin: 0 }}>No one has posted availability yet. {isProfessional ? 'Post yours above.' : 'Check back soon.'}</p>
        </div>
      ) : (
        posts
          .filter((p) => !isProfessional || p.user_id !== user?.id)
          .map((p) => <AvailCard key={p.id} post={p} />)
      )}
    </div>
  )
}

function AvailCard({ post }: { post: AvailabilityPostEnriched }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{post.authorName || 'Professional'}</p>
          {post.authorHeadline && <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{post.authorHeadline}</p>}
        </div>
        <span style={{ fontSize: 12, color: '#A8FF3E', background: 'rgba(168,255,62,0.1)', border: '1px solid rgba(168,255,62,0.2)', borderRadius: 100, padding: '4px 12px', flexShrink: 0 }}>
          Available
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {post.hours_per_week && (
          <span style={{ fontSize: 13, color: '#888' }}>{post.hours_per_week} hrs/wk</span>
        )}
        <span style={{ fontSize: 13, color: '#888' }}>From {formatDate(post.available_from)}</span>
        <span style={{ fontSize: 12, color: '#555' }}>{timeAgo(post.created_at)}</span>
      </div>

      {post.description && (
        <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6, margin: '0 0 12px' }}>{post.description}</p>
      )}

      {post.skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {post.skills.map((s) => <SkillTag key={s} skill={s} />)}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Skill Challenges
// ─────────────────────────────────────────────────────────────────────────────

function ChallengesTab({ isProfessional }: { isProfessional: boolean }) {
  const { user } = useAuthStore()
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [submissions, setSubmissions] = useState<ChallengeSubmissionEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [submitText, setSubmitText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitForm, setShowSubmitForm] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: challenges } = await supabase
      .from('challenges')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!challenges || challenges.length === 0) { setLoading(false); return }
    const ch = challenges[0] as Challenge
    setChallenge(ch)

    const { data: rawSubs } = await supabase
      .from('challenge_submissions')
      .select('*')
      .eq('challenge_id', ch.id)
      .order('vote_count', { ascending: false })

    if (!rawSubs || rawSubs.length === 0) { setSubmissions([]); setLoading(false); return }

    const userIds = [...new Set(rawSubs.map((s) => s.user_id))]
    const [{ data: profiles }, { data: profProfiles }, { data: myVotes }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('professional_profiles').select('user_id, headline').in('user_id', userIds),
      user ? supabase.from('challenge_votes').select('submission_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
    const profMap = Object.fromEntries((profProfiles || []).map((p) => [p.user_id, p]))
    const votedSet = new Set((myVotes || []).map((v: { submission_id: string }) => v.submission_id))

    setSubmissions(rawSubs.map((s, i) => ({
      ...s,
      authorName: profileMap[s.user_id]?.full_name ?? null,
      authorHeadline: profMap[s.user_id]?.headline ?? null,
      isVoted: votedSet.has(s.id),
      isOwn: s.user_id === user?.id,
      is_featured: i < 3,
    })))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchData() }, [fetchData])

  const handleVote = async (submissionId: string) => {
    if (!user) return
    const sub = submissions.find((s) => s.id === submissionId)
    if (!sub || sub.isOwn) return
    const wasVoted = sub.isVoted
    setSubmissions((prev) => prev.map((s) =>
      s.id === submissionId ? { ...s, vote_count: wasVoted ? s.vote_count - 1 : s.vote_count + 1, isVoted: !wasVoted } : s
    ))
    const { error } = await supabase.rpc('toggle_challenge_vote', { p_submission_id: submissionId })
    if (error) {
      setSubmissions((prev) => prev.map((s) =>
        s.id === submissionId ? { ...s, vote_count: wasVoted ? s.vote_count + 1 : s.vote_count - 1, isVoted: wasVoted } : s
      ))
    }
  }

  const handleSubmit = async () => {
    if (!user || !challenge || submitText.trim().length < 50) return
    setSubmitting(true)
    const { error } = await supabase.from('challenge_submissions').insert({
      challenge_id: challenge.id,
      user_id: user.id,
      content: submitText.trim(),
    })
    if (!error) {
      setSubmitText('')
      setShowSubmitForm(false)
      fetchData()
    }
    setSubmitting(false)
  }

  const alreadySubmitted = user ? submissions.some((s) => s.user_id === user.id) : false

  if (loading) return <LoadingSkeleton />

  if (!challenge) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 48 }}>
        <p style={{ color: '#555', fontSize: 15, margin: 0 }}>No active challenge right now. Check back soon.</p>
      </div>
    )
  }

  const remaining = daysLeft(challenge.ends_at)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Challenge brief */}
      <div style={{ ...card, border: '1px solid rgba(232,255,71,0.15)', background: 'rgba(232,255,71,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#E8FF47', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {challenge.category ? `${challenge.category} · ` : ''}Monthly Challenge
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '6px 0 0' }}>{challenge.title}</h2>
          </div>
          {remaining && (
            <span style={{ fontSize: 12, color: '#888', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 100, padding: '5px 12px', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {remaining}
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7, margin: '0 0 20px' }}>{challenge.description}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#555' }}>Top 3 get a <strong style={{ color: '#E8FF47' }}>Featured</strong> badge on their profile for 30 days.</span>
        </div>
      </div>

      {/* Submission form */}
      {isProfessional && !alreadySubmitted && (
        <div>
          {!showSubmitForm ? (
            <button
              onClick={() => setShowSubmitForm(true)}
              style={{
                ...card,
                background: 'rgba(232,255,71,0.04)',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: submitText.length > 1300 ? '#ff6b6b' : '#555' }}>{submitText.length}/1500</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={() => setShowSubmitForm(false)}>Cancel</Button>
                  <Button variant="primary" onClick={handleSubmit} disabled={submitting || submitText.trim().length < 50}>
                    {submitting ? 'Submitting…' : 'Submit'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isProfessional && alreadySubmitted && (
        <div style={{ ...card, background: 'rgba(168,255,62,0.04)', border: '1px solid rgba(168,255,62,0.2)', textAlign: 'center' }}>
          <p style={{ color: '#A8FF3E', fontWeight: 600, fontSize: 14, margin: 0 }}>
            You've submitted an answer. Vote on others below to support the community.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      {submissions.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''} · vote for the best
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {submissions.map((sub, idx) => (
              <SubmissionCard key={sub.id} sub={sub} rank={idx + 1} onVote={handleVote} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionCard({
  sub,
  rank,
  onVote,
}: {
  sub: ChallengeSubmissionEnriched
  rank: number
  onVote: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(rank <= 2)
  const isFeatured = rank <= 3

  return (
    <div
      style={{
        ...card,
        border: isFeatured
          ? `1px solid rgba(232,255,71,${rank === 1 ? '0.4' : rank === 2 ? '0.25' : '0.15'})`
          : '1px solid #2a2a2a',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Rank */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: rank <= 3 ? 'rgba(232,255,71,0.12)' : '#1a1a1a',
            border: `1px solid ${rank <= 3 ? 'rgba(232,255,71,0.3)' : '#2a2a2a'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: rank <= 3 ? '#E8FF47' : '#555',
            flexShrink: 0,
          }}
        >
          {rank}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>
                {sub.authorName || 'Anonymous'}
                {isFeatured && !sub.isOwn && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#E8FF47', background: 'rgba(232,255,71,0.12)', border: '1px solid rgba(232,255,71,0.25)', borderRadius: 100, padding: '2px 8px' }}>
                    Featured
                  </span>
                )}
              </p>
              {sub.authorHeadline && <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{sub.authorHeadline}</p>}
            </div>
            <span style={{ fontSize: 11, color: '#555', flexShrink: 0, marginLeft: 8 }}>{timeAgo(sub.created_at)}</span>
          </div>

          <p
            style={{
              fontSize: 14,
              color: '#ccc',
              lineHeight: 1.7,
              margin: '0 0 12px',
              display: expanded ? undefined : '-webkit-box',
              WebkitLineClamp: expanded ? undefined : 3,
              WebkitBoxOrient: expanded ? undefined : 'vertical',
              overflow: expanded ? undefined : 'hidden',
            }}
          >
            {sub.content}
          </p>
          {sub.content.length > 200 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ background: 'none', border: 'none', color: '#E8FF47', fontSize: 12, cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit' }}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}

          <button
            onClick={() => !sub.isOwn && onVote(sub.id)}
            disabled={sub.isOwn}
            style={{
              background: sub.isVoted ? 'rgba(232,255,71,0.1)' : 'transparent',
              border: `1px solid ${sub.isVoted ? 'rgba(232,255,71,0.3)' : '#2a2a2a'}`,
              borderRadius: 100,
              color: sub.isOwn ? '#333' : sub.isVoted ? '#E8FF47' : '#555',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 14px',
              cursor: sub.isOwn ? 'default' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            ▲ {sub.vote_count} {sub.isOwn ? '(yours)' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 16, padding: 20 }}>
          <div style={{ background: '#1e1e1e', borderRadius: 8, height: 14, width: '40%', marginBottom: 10, animation: 'pulse 1.5s infinite' }} />
          <div style={{ background: '#1e1e1e', borderRadius: 8, height: 12, width: '90%', marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
          <div style={{ background: '#1e1e1e', borderRadius: 8, height: 12, width: '70%', animation: 'pulse 1.5s infinite' }} />
        </div>
      ))}
    </div>
  )
}
