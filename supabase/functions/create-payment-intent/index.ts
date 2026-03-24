import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { matchId } = body;

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: "matchId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase env vars not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: " + (authError?.message || "no user") }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Creating payment intent for matchId:", matchId, "user:", user.id);

    // Fetch match — do NOT use FK join syntax to avoid RLS issues; do two queries
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, payment_status, opportunity_id, professional_id")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      console.error("Match fetch error:", matchError);
      return new Response(
        JSON.stringify({ error: "Match not found: " + (matchError?.message || matchId) }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (match.payment_status === "paid") {
      return new Response(
        JSON.stringify({ error: "This connection has already been paid for" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch opportunity separately to verify ownership
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select("id, title, client_id")
      .eq("id", match.opportunity_id)
      .single();

    if (oppError || !opportunity) {
      console.error("Opportunity fetch error:", oppError);
      return new Response(
        JSON.stringify({ error: "Opportunity not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (opportunity.client_id !== user.id) {
      console.error("Unauthorized: opportunity.client_id", opportunity.client_id, "!= user.id", user.id);
      return new Response(
        JSON.stringify({ error: "Unauthorized: you do not own this opportunity" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    let customerId: string | undefined;
    const { data: clientProfile } = await supabase
      .from("client_profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    customerId = clientProfile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      console.log("Creating new Stripe customer for user:", user.id);
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabaseUserId: user.id },
      });
      customerId = customer.id;
      // Upsert so it works even if no client_profiles record exists yet
      await supabase
        .from("client_profiles")
        .upsert({ user_id: user.id, stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    console.log("Creating payment intent for customer:", customerId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 15000, // $150.00
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

    // Store intent ID on the match
    await supabase
      .from("matches")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", matchId);

    console.log("Payment intent created:", paymentIntent.id);

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("create-payment-intent unhandled error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
