import { useState, useEffect, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '@/lib/supabase'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const appearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#E8FF47',
    colorBackground: '#141414',
    colorText: '#ffffff',
    colorDanger: '#ff4444',
    borderRadius: '12px',
    fontFamily: 'DM Sans, sans-serif',
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PaymentDialogProps {
  matchId: string
  professionalName: string
  professionalHeadline: string | null
  opportunityTitle: string
  onClose: () => void
  onSuccess: (email: string) => void
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export default function PaymentDialog({
  matchId,
  professionalName,
  professionalHeadline,
  opportunityTitle,
  onClose,
  onSuccess,
}: PaymentDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
          body: { matchId },
        })
        if (error) throw new Error(error.message)
        if (!data?.clientSecret) throw new Error('No client secret returned')
        setClientSecret(data.clientSecret)
      } catch (err: any) {
        setInitError(err.message || 'Failed to initialize payment')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [matchId])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 20,
          padding: 32,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
            Connect with this professional
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: 20,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
              marginLeft: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* Professional info */}
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 20,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
            {professionalName}
          </p>
          {professionalHeadline && (
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{professionalHeadline}</p>
          )}
          <p style={{ fontSize: 12, color: '#555', margin: '8px 0 0' }}>
            For: {opportunityTitle}
          </p>
        </div>

        {/* Fee description */}
        <p style={{ fontSize: 14, color: '#888', margin: '0 0 16px', lineHeight: 1.6 }}>
          One-time connection fee — get this professional's direct contact details.
        </p>

        {/* Price */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#fff' }}>$150</span>
          <span style={{ fontSize: 14, color: '#888', marginLeft: 8 }}>one-time</span>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', fontSize: 14 }}>
            Loading payment form...
          </div>
        )}

        {initError && (
          <div
            style={{
              background: 'rgba(255,68,68,0.1)',
              border: '1px solid rgba(255,68,68,0.3)',
              borderRadius: 10,
              padding: '12px 16px',
              color: '#ff6b6b',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {initError}
          </div>
        )}

        {!loading && !initError && clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance }}
          >
            <PaymentForm
              matchId={matchId}
              clientSecret={clientSecret}
              onSuccess={onSuccess}
            />
          </Elements>
        )}
      </div>
    </div>
  )
}

// ─── PaymentForm (inner) ──────────────────────────────────────────────────────

function PaymentForm({
  matchId,
  onSuccess,
}: {
  matchId: string
  clientSecret: string
  onSuccess: (email: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const [submitting, setSubmitting] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const pollForConnection = useCallback(async (): Promise<boolean> => {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      const { data } = await supabase
        .from('matches')
        .select('status')
        .eq('id', matchId)
        .single()
      if (data?.status === 'connected') return true
      await new Promise((r) => setTimeout(r, 2000))
    }
    return false
  }, [matchId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setPayError(null)

    try {
      const { error: paymentError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (paymentError) {
        setPayError(paymentError.message || 'Payment failed')
        setSubmitting(false)
        return
      }

      // Poll for webhook to process
      const connected = await pollForConnection()

      if (connected) {
        const { data: emailData } = await supabase.rpc('get_connected_professional_email', {
          match_id: matchId,
        })
        const email = emailData || 'contact@matched.app'
        setConnectedEmail(email)
        setSucceeded(true)
        onSuccess(email)
      } else {
        setConnectedEmail(null)
        setSucceeded(true)
        onSuccess('')
      }
    } catch (err: any) {
      setPayError(err.message || 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (succeeded) {
    return (
      <div style={{ textAlign: 'center' }}>
        {/* Checkmark */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(168,255,62,0.15)',
            border: '2px solid #A8FF3E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            margin: '0 auto 16px',
            color: '#A8FF3E',
          }}
        >
          ✓
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
          You're connected!
        </h3>
        <p style={{ fontSize: 14, color: '#888', margin: '0 0 20px' }}>
          Reach out directly to start working together.
        </p>

        {connectedEmail && (
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span style={{ flex: 1, fontSize: 14, color: '#fff', fontFamily: 'monospace' }}>
              {connectedEmail}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(connectedEmail)
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
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {connectedEmail && (
          <a
            href={`mailto:${connectedEmail}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#E8FF47',
              color: '#000',
              padding: '12px 24px',
              borderRadius: 100,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            Send email →
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 20 }}>
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {payError && (
        <div
          style={{
            background: 'rgba(255,68,68,0.1)',
            border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            color: '#ff6b6b',
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {payError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !stripe || !elements}
        style={{
          width: '100%',
          background: submitting ? '#aaa' : '#E8FF47',
          color: '#000',
          border: 'none',
          borderRadius: 100,
          padding: '14px 24px',
          fontWeight: 700,
          fontSize: 15,
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        {submitting ? 'Processing...' : 'Pay $150 and connect'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#555', marginTop: 12 }}>
        Secured by Stripe
      </p>
    </form>
  )
}
