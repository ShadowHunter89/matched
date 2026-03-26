import { useState, useEffect } from 'react'
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
        // Explicitly get the session token — don't rely on SDK auto-inject
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error('You must be logged in to make a payment')
        }

        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
          body: { matchId },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        // Function always returns 200 — errors are in data.error
        if (error) throw new Error('Network error: ' + error.message)
        if (!data) throw new Error('No response from payment service')
        if (data.error) throw new Error(data.error)
        if (!data.clientSecret) throw new Error('Payment service did not return a client secret')
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
          maxHeight: '90vh',
          overflowY: 'auto',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setPayError(null)

    try {
      const { error: paymentError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/client`,
        },
      })

      if (paymentError) {
        setPayError(paymentError.message || 'Payment failed')
        return
      }

      // Payment confirmed — get email + mark match connected, then hand off to parent
      const { data: emailData, error: rpcError } = await supabase.rpc(
        'get_connected_professional_email',
        { match_id: matchId }
      )
      const email = (!rpcError && emailData) ? emailData : ''
      onSuccess(email)  // parent closes this dialog and shows ConnectionSuccessOverlay

    } catch (err: any) {
      setPayError(err.message || 'Payment failed')
    } finally {
      setSubmitting(false)
    }
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
