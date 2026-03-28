import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by pg_cron every 6 hours.
// Finds pending matches older than 48h with no reminder sent,
// sends a reminder email to the professional, marks reminder_sent=true.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey   = Deno.env.get("RESEND_API_KEY");
  const appUrl      = Deno.env.get("APP_URL") || "https://matched.app";

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find pending matches >48h old with no reminder sent yet
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: staleMatches, error } = await supabase
    .from("matches")
    .select(`
      id, professional_id, similarity_score,
      opportunities (title, required_skills, budget_min, budget_max, hours_per_week, remote_option)
    `)
    .eq("status", "pending")
    .eq("reminder_sent", false)
    .lt("created_at", cutoff);

  if (error) {
    console.error("Failed to fetch stale matches:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!staleMatches || staleMatches.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;

  for (const match of staleMatches) {
    try {
      const opp = match.opportunities as any;

      // Professional email
      const { data: authData } = await supabase.auth.admin.getUserById(match.professional_id);
      const profEmail = authData?.user?.email;
      if (!profEmail) continue;

      // Professional first name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", match.professional_id)
        .single();
      const name = profile?.full_name?.split(" ")[0] || "there";

      const score = Math.round((match.similarity_score || 0) * 100);
      const budget =
        opp.budget_min && opp.budget_max
          ? `$${opp.budget_min / 100}–$${opp.budget_max / 100}/hr`
          : "Flexible";

      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder: respond to your match</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0C0C0C; color: #fff; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-size: 20px; font-weight: 800; color: #E8FF47; margin-bottom: 40px; }
    h1 { font-size: 24px; font-weight: 700; line-height: 1.3; margin-bottom: 10px; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 32px; line-height: 1.6; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 24px; margin-bottom: 28px; }
    .opp-title { font-size: 17px; font-weight: 600; color: #fff; margin-bottom: 12px; }
    .meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 0; }
    .meta-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 5px 12px; font-size: 13px; color: #aaa; }
    .score-chip { background: #E8FF47; color: #000; font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 8px; }
    .cta { display: inline-block; background: #E8FF47; color: #000; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 100px; text-decoration: none; }
    .urgency { color: #ff6b6b; font-size: 13px; margin-top: 14px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e1e; color: #444; font-size: 12px; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">matched</div>
    <h1>Hey ${name}, you haven't responded to this match yet</h1>
    <p class="subtitle">
      This opportunity is still waiting for your answer. Accept or decline before it expires.
    </p>

    <div class="card">
      <div class="opp-title">${opp.title}</div>
      <div class="meta-row">
        <span class="score-chip">${score}% match</span>
        <span class="meta-chip">💰 ${budget}</span>
        ${opp.hours_per_week ? `<span class="meta-chip">⏱ ${opp.hours_per_week} hrs/wk</span>` : ""}
        ${opp.remote_option ? `<span class="meta-chip">📍 ${opp.remote_option.replace(/_/g, " ")}</span>` : ""}
      </div>
    </div>

    <a href="${appUrl}/dashboard/professional" class="cta">View &amp; Respond →</a>
    <p class="urgency">This match will expire if not responded to.</p>

    <div class="footer">
      You received this because you have an active professional profile on Matched.<br>
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
            subject: `Reminder: you haven't responded to "${opp.title}" yet`,
            html: emailHtml,
          }),
        });

        if (!res.ok) {
          console.error("Resend error for", profEmail, ":", await res.text());
          continue;
        }
      } else {
        console.log("RESEND_API_KEY not set — skipping reminder to", profEmail);
      }

      // Mark reminder sent so we don't email again
      await supabase
        .from("matches")
        .update({ reminder_sent: true, updated_at: new Date().toISOString() })
        .eq("id", match.id);

      sent++;
    } catch (e) {
      console.error("Error processing match", match.id, ":", e);
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
