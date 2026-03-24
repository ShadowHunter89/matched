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
    const { matchId } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { data: match } = await supabase
      .from("matches")
      .select("id, payment_status, opportunities(title, client_id)")
      .eq("id", matchId)
      .single();

    if (!match) throw new Error("Match not found");
    if ((match.opportunities as any).client_id !== user.id) throw new Error("Unauthorized");
    if (match.payment_status === "paid") throw new Error("Already paid");

    const { data: clientProfile } = await supabase
      .from("client_profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = clientProfile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await supabase
        .from("client_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 15000,
      currency: "usd",
      customer: customerId,
      metadata: { matchId, clientId: user.id },
      description: `Connection: ${(match.opportunities as any).title}`,
    });

    await supabase
      .from("matches")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", matchId);

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-payment-intent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
