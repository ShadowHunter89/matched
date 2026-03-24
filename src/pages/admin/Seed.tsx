import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeedResult {
  email: string
  status?: string
  userId?: string
  error?: string
}

interface LogLine {
  type: 'info' | 'success' | 'error' | 'header'
  text: string
  ts: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Seed() {
  const navigate = useNavigate()
  const [seeding, setSeeding] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const appendLog = (line: LogLine) => {
    setLog((prev) => [...prev, line])
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const handleSeed = async () => {
    setSeeding(true)
    setDone(false)
    setLog([])

    appendLog({ type: 'header', text: '── Seeding Matched test professionals ──', ts: ts() })
    appendLog({ type: 'info', text: 'Calling seed-professionals edge function...', ts: ts() })

    try {
      const { data, error } = await supabase.functions.invoke('seed-professionals')

      if (error) {
        appendLog({ type: 'error', text: `Function error: ${error.message}`, ts: ts() })
        setSeeding(false)
        setDone(true)
        return
      }

      const results: SeedResult[] = data?.results || []

      if (results.length === 0) {
        appendLog({ type: 'info', text: 'No results returned from function.', ts: ts() })
      }

      const newLogs = results.map((r: any) =>
        r.error
          ? `❌ ${r.email}: ${r.error}`
          : `${r.embeddingStored ? '✅' : '⚠️'} ${r.email}${r.embeddingStored ? ' + embedded' : ' — NO EMBEDDING'}`
      )
      for (const logText of newLogs) {
        appendLog({
          type: logText.startsWith('❌') ? 'error' : logText.startsWith('✅') ? 'success' : 'info',
          text: logText,
          ts: ts(),
        })
      }

      const successCount = results.filter((r) => !r.error).length
      const errorCount = results.filter((r) => !!r.error).length

      appendLog({ type: 'header', text: '──────────────────────────────────────', ts: ts() })
      appendLog({
        type: successCount > 0 ? 'success' : 'info',
        text: `Done. ${successCount} created/updated, ${errorCount} failed.`,
        ts: ts(),
      })
    } catch (err: any) {
      appendLog({ type: 'error', text: `Unexpected error: ${err.message}`, ts: ts() })
    } finally {
      setSeeding(false)
      setDone(true)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0C0C0C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'DM Sans, -apple-system, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 600 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#555',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              margin: '0 0 12px',
            }}
          >
            Admin
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
            Seed Test Data
          </h1>
          <p style={{ fontSize: 15, color: '#888', margin: 0 }}>
            Creates 5 test professional accounts with embeddings
          </p>
        </div>

        {/* Warning */}
        <div
          style={{
            background: 'rgba(232,255,71,0.06)',
            border: '1px solid rgba(232,255,71,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 13, color: '#c8db40', margin: 0 }}>
            This creates real user accounts. Only use in development.
          </p>
        </div>

        {/* Seed button */}
        <button
          onClick={handleSeed}
          disabled={seeding}
          style={{
            background: seeding ? '#2a2a2a' : '#E8FF47',
            color: seeding ? '#555' : '#000',
            border: 'none',
            borderRadius: 100,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 700,
            cursor: seeding ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 0.15s',
          }}
        >
          {seeding && (
            <span
              style={{
                width: 14,
                height: 14,
                border: '2px solid #555',
                borderTopColor: '#888',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
          {seeding ? 'Seeding...' : 'Seed 5 Professionals'}
        </button>

        {/* Progress log */}
        {log.length > 0 && (
          <div
            ref={logRef}
            style={{
              background: '#0a0a0a',
              border: '1px solid #1e1e1e',
              borderRadius: 12,
              padding: '16px 20px',
              height: 300,
              overflowY: 'auto',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            {log.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
                <span style={{ color: '#333', flexShrink: 0 }}>{line.ts}</span>
                <span
                  style={{
                    color:
                      line.type === 'success'
                        ? '#A8FF3E'
                        : line.type === 'error'
                        ? '#ff6b6b'
                        : line.type === 'header'
                        ? '#555'
                        : '#888',
                  }}
                >
                  {line.text}
                </span>
              </div>
            ))}
            {seeding && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 2 }}>
                <span style={{ color: '#333', flexShrink: 0 }}>{ts()}</span>
                <span style={{ color: '#555', animation: 'blink 1s ease-in-out infinite' }}>
                  ▌
                </span>
              </div>
            )}
          </div>
        )}

        {done && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Seed complete.
            </p>
            <button
              onClick={() => navigate('/admin/diagnostics')}
              style={{
                background: 'transparent',
                color: '#E8FF47',
                border: '1px solid rgba(232,255,71,0.3)',
                borderRadius: 100,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              → Run diagnostics
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}
