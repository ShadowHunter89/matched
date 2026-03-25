import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: object) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getUserIdFromJWT(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── 1. Auth — decode JWT locally (fast, no HTTP call) ──────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return err("Missing authorization token");

    const userId = getUserIdFromJWT(token);
    if (!userId) return err("Invalid token: could not extract user ID");

    // ── 2. Parse body ───────────────────────────────────────────────────────
    let matchId: string | undefined;
    try {
      const body = await req.json();
      matchId = body?.matchId;
    } catch {
      return err("Invalid JSON body");
    }
    if (!matchId) return err("matchId is required");

    console.log("create-payment-intent | user:", userId, "match:", matchId);

    // ── 3. Env vars ─────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseKey) return err("Supabase not configured");
    if (!stripeKey) return err("Stripe not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 4. Fetch match ──────────────────────────────────────────────────────
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, payment_status, opportunity_id, professional_id, stripe_payment_intent_id")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) return err("Match not found");
    if (match.payment_status === "paid") return err("Already paid for this connection");

    // ── 5. Verify client owns this opportunity ──────────────────────────────
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, title, client_id")
      .eq("id", match.opportunity_id)
      .single();

    if (oppErr || !opp) return err("Opportunity not found");
    if (opp.client_id !== userId) return err("You do not own this opportunity");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // ── 6. Re-use existing intent if still valid ────────────────────────────
    if (match.stripe_payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(match.stripe_payment_intent_id);
        if (existing.client_secret && existing.status !== "canceled") {
          return ok({ clientSecret: existing.client_secret });
        }
      } catch {
        // fall through to create new
      }
    }

    // ── 7. Get or create Stripe customer ────────────────────────────────────
    let customerId: string | undefined;
    const { data: cp } = await supabase
      .from("client_profiles")
      .select("stripe_customer_id, company_name")
      .eq("user_id", userId)
      .single();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    customerId = cp?.stripe_customer_id ?? undefined;

    if (!customerId) {
      // Get user email from auth
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
      const customer = await stripe.customers.create({
        email: authUser?.email ?? undefined,
        name: profile?.full_name || "Client",
        metadata: {
          supabaseUserId: userId,
          company: cp?.company_name || "",
        },
      });
      customerId = customer.id;
      await supabase
        .from("client_profiles")
        .upsert({ user_id: userId, stripe_customer_id: customerId });
    }

    // ── 8. Create payment intent ─────────────────────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 15000, // $150.00
      currency: "usd",
      customer: customerId,
      metadata: {
        matchId,
        clientId: userId,
        opportunityId: match.opportunity_id,
        professionalId: match.professional_id,
      },
      description: `Matched: connect with professional for "${opp.title}"`,
    });

    await supabase
      .from("matches")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", matchId);

    console.log("Payment intent created:", paymentIntent.id);
    return ok({ clientSecret: paymentIntent.client_secret! });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("create-payment-intent error:", msg);
    return err("Server error: " + msg);
  }
});
