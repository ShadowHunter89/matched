import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function respond(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Decode JWT locally — no network round-trip needed
function decodeJWT(token: string): { sub?: string; role?: string } | null {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let matchId: string | undefined;
  try {
    const body = await req.json();
    matchId = body?.matchId;
  } catch {
    return respond({ error: "Invalid JSON body" });
  }
  if (!matchId) return respond({ error: "matchId is required" });

  // ── 2. Auth — decode JWT locally (fast, no HTTP call) ─────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const claims = decodeJWT(token);

  if (!claims?.sub) {
    return respond({ error: "Not authenticated — please log in again" });
  }
  const userId = claims.sub;

  console.log("create-payment-intent | user:", userId, "match:", matchId);

  // ── 3. Env vars ────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");

  if (!supabaseUrl || !supabaseKey) return respond({ error: "Supabase not configured" });
  if (!stripeKey)                   return respond({ error: "Stripe not configured" });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ── 4. Fetch match ─────────────────────────────────────────────────────
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, payment_status, opportunity_id, professional_id, stripe_payment_intent_id")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return respond({ error: "Match not found" });
    }
    if (match.payment_status === "paid") {
      return respond({ error: "Already paid for this connection" });
    }

    // ── 5. Verify client owns this opportunity ─────────────────────────────
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, title, client_id")
      .eq("id", match.opportunity_id)
      .single();

    if (oppErr || !opp) {
      return respond({ error: "Opportunity not found" });
    }
    if (opp.client_id !== userId) {
      return respond({ error: "You do not own this opportunity" });
    }

    // ── 6. Re-use existing intent if still valid ───────────────────────────
    if (match.stripe_payment_intent_id) {
      try {
        const { Stripe } = await import("https://esm.sh/stripe@14.21.0?target=deno");
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        const existing = await stripe.paymentIntents.retrieve(match.stripe_payment_intent_id);
        if (existing.client_secret && existing.status !== "canceled") {
          return respond({ clientSecret: existing.client_secret });
        }
      } catch {
        // fall through to create new
      }
    }

    // ── 7. Get or create Stripe customer ───────────────────────────────────
    const { Stripe } = await import("https://esm.sh/stripe@14.21.0?target=deno");
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    let customerId: string | undefined;
    const { data: cp } = await supabase
      .from("client_profiles")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    customerId = cp?.stripe_customer_id ?? undefined;

    if (!customerId) {
      // Get user email from auth
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
      const customer = await stripe.customers.create({
        email: authUser?.email ?? undefined,
        metadata: { supabaseUserId: userId },
      });
      customerId = customer.id;
      await supabase
        .from("client_profiles")
        .upsert({ user_id: userId, stripe_customer_id: customerId });
    }

    // ── 8. Create payment intent ───────────────────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 15000,
      currency: "usd",
      customer: customerId,
      metadata: {
        matchId,
        clientId: userId,
        opportunityId: match.opportunity_id,
        professionalId: match.professional_id,
      },
      description: `Matched: ${opp.title}`,
    });

    await supabase
      .from("matches")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", matchId);

    console.log("Payment intent created:", paymentIntent.id);
    return respond({ clientSecret: paymentIntent.client_secret! });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error:", msg);
    return respond({ error: msg });
  }
});
