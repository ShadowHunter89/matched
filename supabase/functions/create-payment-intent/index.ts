import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always return 200 — embed errors in the body so the Supabase SDK
// doesn't swallow the response and we can read the actual message.
function ok(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let matchId: string | undefined;
  try {
    const body = await req.json();
    matchId = body?.matchId;
  } catch {
    return ok({ error: "Invalid request body — expected JSON with matchId" });
  }

  if (!matchId) {
    return ok({ error: "matchId is required" });
  }

  // ── 2. Env vars ────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");

  if (!supabaseUrl || !supabaseKey) return ok({ error: "Supabase env vars not configured" });
  if (!stripeKey)                   return ok({ error: "STRIPE_SECRET_KEY not configured" });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── 3. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return ok({ error: "Missing Authorization header" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return ok({ error: "Unauthorized: " + (authErr?.message ?? "no session") });
  }

  console.log("create-payment-intent | user:", user.id, "matchId:", matchId);

  try {
    // ── 4. Fetch match ───────────────────────────────────────────────────────
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, payment_status, opportunity_id, professional_id, stripe_payment_intent_id")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      console.error("match fetch:", matchErr?.message);
      return ok({ error: "Match not found (id: " + matchId + ")" });
    }

    if (match.payment_status === "paid") {
      return ok({ error: "This match has already been paid for" });
    }

    // If we already created an intent, return the same secret
    if (match.stripe_payment_intent_id) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
      try {
        const existing = await stripe.paymentIntents.retrieve(match.stripe_payment_intent_id);
        if (existing.client_secret && existing.status !== "canceled") {
          console.log("Returning existing intent:", existing.id);
          return ok({ clientSecret: existing.client_secret });
        }
      } catch {
        // Intent no longer valid — create a new one below
      }
    }

    // ── 5. Verify ownership ──────────────────────────────────────────────────
    const { data: opportunity, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, title, client_id")
      .eq("id", match.opportunity_id)
      .single();

    if (oppErr || !opportunity) {
      console.error("opportunity fetch:", oppErr?.message);
      return ok({ error: "Opportunity not found" });
    }

    if (opportunity.client_id !== user.id) {
      console.error("Ownership mismatch:", opportunity.client_id, "!=", user.id);
      return ok({ error: "Unauthorized: you did not post this opportunity" });
    }

    // ── 6. Stripe customer ───────────────────────────────────────────────────
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    let customerId: string | undefined;
    const { data: clientProfile } = await supabase
      .from("client_profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    customerId = clientProfile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      console.log("Creating Stripe customer for:", user.email);
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabaseUserId: user.id },
      });
      customerId = customer.id;
      // Upsert — works even if no client_profiles row yet
      await supabase
        .from("client_profiles")
        .upsert({ user_id: user.id, stripe_customer_id: customerId });
    }

    // ── 7. Create payment intent ─────────────────────────────────────────────
    console.log("Creating payment intent | customer:", customerId);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 15000,
      currency: "usd",
      customer: customerId,
      metadata: {
        matchId,
        clientId: user.id,
        opportunityId: match.opportunity_id,
        professionalId: match.professional_id,
      },
      description: `Matched connection: ${opportunity.title}`,
    });

    // Store intent ID for idempotency
    await supabase
      .from("matches")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", matchId);

    console.log("Payment intent created:", paymentIntent.id);
    return ok({ clientSecret: paymentIntent.client_secret! });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("create-payment-intent error:", msg);
    return ok({ error: msg });
  }
});
