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

      // Send email to professional notifying them the client has connected
      sendConnectionEmailToProfessional(supabase, matchId).catch((e) =>
        console.error("send-connection-email error (non-fatal):", e)
      );
    } else {
      console.warn("payment_intent.succeeded with no matchId in metadata, pi:", pi.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─── Send connection email to professional ───────────────────────────────────

async function sendConnectionEmailToProfessional(supabase: ReturnType<typeof createClient>, matchId: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = Deno.env.get("APP_URL") || "https://matched.app";

  // Fetch match with opportunity
  const { data: match } = await supabase
    .from("matches")
    .select("id, professional_id, opportunities(id, title, client_id)")
    .eq("id", matchId)
    .single();

  if (!match) { console.error("connection email: match not found", matchId); return; }

  const opp = match.opportunities as any;

  // Professional email + name
  const { data: profAuthData } = await supabase.auth.admin.getUserById(match.professional_id);
  const profEmail = profAuthData?.user?.email;
  if (!profEmail) { console.error("connection email: professional email not found"); return; }

  const { data: profProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", match.professional_id)
    .single();
  const profName = profProfile?.full_name?.split(" ")[0] || "there";

  // Client name + email + company
  const { data: clientAuthData } = await supabase.auth.admin.getUserById(opp.client_id);
  const clientEmail = clientAuthData?.user?.email || "";

  const { data: clientProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", opp.client_id)
    .single();
  const clientName = clientProfile?.full_name || "Your client";

  const { data: clientBizProfile } = await supabase
    .from("client_profiles")
    .select("company_name")
    .eq("user_id", opp.client_id)
    .single();
  const companyName = clientBizProfile?.company_name || "";

  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been connected on Matched</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0C0C0C; color: #ffffff; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-size: 20px; font-weight: 800; color: #E8FF47; letter-spacing: -0.5px; margin-bottom: 40px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(168,255,62,0.1); border: 1px solid rgba(168,255,62,0.3); border-radius: 100px; padding: 6px 16px; margin-bottom: 24px; }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; background: #A8FF3E; }
    .badge-text { color: #A8FF3E; font-size: 14px; font-weight: 700; }
    h1 { font-size: 26px; font-weight: 700; line-height: 1.3; margin-bottom: 10px; letter-spacing: -0.3px; color: #fff; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 36px; line-height: 1.6; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 28px; margin-bottom: 32px; }
    .label { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .value { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 20px; }
    .email-row { display: flex; align-items: center; gap: 10px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; }
    .email-addr { font-size: 15px; color: #E8FF47; font-weight: 600; flex: 1; }
    .divider { height: 1px; background: #2a2a2a; margin: 20px 0; }
    .cta { display: inline-block; background: #E8FF47; color: #000; font-size: 15px; font-weight: 700; padding: 16px 36px; border-radius: 100px; text-decoration: none; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e1e; color: #444; font-size: 12px; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">matched</div>

    <div class="badge">
      <span class="badge-dot"></span>
      <span class="badge-text">Connected</span>
    </div>

    <h1>Hey ${profName}, ${clientName} wants to work with you</h1>
    <p class="subtitle">
      They've paid to connect with you for <strong style="color:#fff">${opp.title}</strong>. Reach out and start the conversation.
    </p>

    <div class="card">
      <div class="label">Client</div>
      <div class="value">${clientName}${companyName ? ` · ${companyName}` : ""}</div>

      <div class="label">Opportunity</div>
      <div class="value">${opp.title}</div>

      <div class="divider"></div>

      <div class="label">Their email address</div>
      <div class="email-row">
        <span class="email-addr">${clientEmail}</span>
      </div>
    </div>

    <a href="mailto:${clientEmail}" class="cta">Email ${clientName} →</a>

    <div class="footer">
      You received this because a client connected with you on Matched.<br>
      © ${new Date().getFullYear()} Matched. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Matched <hello@matched.app>",
        to: [profEmail],
        subject: `${clientName} wants to work with you — here's their contact`,
        html: emailHtml,
      }),
    });
    if (!res.ok) console.error("Resend error (connection email):", await res.text());
    else console.log("Connection email sent to professional:", profEmail);
  } else {
    console.log("RESEND_API_KEY not set — skipping connection email to", profEmail);
  }
}
