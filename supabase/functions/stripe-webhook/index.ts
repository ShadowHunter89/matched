import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("Missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey) return new Response("Stripe not configured", { status: 500 });
  if (!webhookSecret) return new Response("Webhook secret not configured", { status: 500 });

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("Webhook event type:", event.type);

  if (event.type === "payment_intent.succeeded") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const pi = event.data.object as Stripe.PaymentIntent;
    const { matchId } = pi.metadata;

    console.log("Payment succeeded for matchId:", matchId, "pi:", pi.id);

    if (matchId) {
      const { error } = await supabase
        .from("matches")
        .update({
          payment_status: "paid",
          status: "connected",
          stripe_payment_intent_id: pi.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);

      if (error) {
        console.error("Failed to update match:", error);
        return new Response("Database update failed", { status: 500 });
      }

      console.log(`Match ${matchId} marked as paid and connected`);
    } else {
      console.warn("payment_intent.succeeded with no matchId in metadata, pi:", pi.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
