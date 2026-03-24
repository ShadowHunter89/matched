import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const appUrl = Deno.env.get("APP_URL") || "https://matched.app";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: match } = await supabase
      .from("matches")
      .select(`
        id, similarity_score, professional_id,
        opportunities (
          title, description, budget_min, budget_max,
          hours_per_week, remote_option, required_skills
        )
      `)
      .eq("id", matchId)
      .single();

    if (!match) throw new Error("Match not found");

    const { data: authUser } = await supabase.auth.admin.getUserById(match.professional_id);
    const professionalEmail = authUser?.user?.email;
    if (!professionalEmail) throw new Error("Email not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", match.professional_id)
      .single();

    const name = profile?.full_name?.split(" ")[0] || "there";
    const opp = match.opportunities as any;
    const score = Math.round((match.similarity_score || 0) * 100);
    const scoreColor = score >= 85 ? "#A8FF3E" : score >= 70 ? "#E8FF47" : "#888888";
    const budget =
      opp.budget_min && opp.budget_max
        ? `$${opp.budget_min / 100}–$${opp.budget_max / 100}/hr`
        : "Flexible";
    const skills = (opp.required_skills || []).slice(0, 6);
    const descPreview = (opp.description || "").slice(0, 280) + ((opp.description || "").length > 280 ? "..." : "");

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${score}% match: ${opp.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0C0C0C; color: #ffffff; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-size: 20px; font-weight: 800; color: #E8FF47; letter-spacing: -0.5px; margin-bottom: 40px; display: flex; align-items: center; gap: 4px; }
    .score-badge { display: inline-flex; align-items: center; gap: 6px; background: ${scoreColor}18; border: 1px solid ${scoreColor}40; border-radius: 100px; padding: 6px 16px; margin-bottom: 24px; }
    .score-dot { width: 8px; height: 8px; border-radius: 50%; background: ${scoreColor}; }
    .score-text { color: ${scoreColor}; font-size: 14px; font-weight: 700; }
    h1 { font-size: 26px; font-weight: 700; line-height: 1.3; margin-bottom: 10px; letter-spacing: -0.3px; color: #fff; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 36px; line-height: 1.6; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 28px; margin-bottom: 32px; }
    .card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; gap: 12px; }
    .opp-title { font-size: 18px; font-weight: 600; color: #fff; line-height: 1.4; }
    .opp-score-pill { background: ${scoreColor}; color: #000; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 100px; flex-shrink: 0; white-space: nowrap; }
    .opp-desc { color: #888; font-size: 14px; line-height: 1.7; margin-bottom: 20px; }
    .divider { height: 1px; background: #2a2a2a; margin-bottom: 18px; }
    .meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .meta-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 5px 12px; font-size: 13px; color: #aaa; }
    .skills-label { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
    .skills-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .skill-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 100px; padding: 4px 12px; font-size: 12px; color: #aaa; }
    .cta-section { text-align: center; margin-bottom: 8px; }
    .cta { display: inline-block; background: #E8FF47; color: #000; font-size: 15px; font-weight: 700; padding: 16px 36px; border-radius: 100px; text-decoration: none; letter-spacing: -0.2px; }
    .urgency { color: #555; font-size: 13px; margin-top: 16px; text-align: center; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e1e; color: #444; font-size: 12px; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">matched<span style="width:6px;height:6px;border-radius:50%;background:#E8FF47;display:inline-block;margin-bottom:8px;"></span></div>

    <div class="score-badge">
      <span class="score-dot"></span>
      <span class="score-text">${score}% match score</span>
    </div>

    <h1>Hey ${name}, a new opportunity matches your profile</h1>
    <p class="subtitle">
      You're one of ${score >= 85 ? "3" : "5"} professionals selected for this role. Review it and respond before it's filled.
    </p>

    <div class="card">
      <div class="card-header">
        <div class="opp-title">${opp.title}</div>
        <span class="opp-score-pill">${score}%</span>
      </div>
      ${descPreview ? `<p class="opp-desc">${descPreview}</p>` : ""}
      <div class="divider"></div>
      <div class="meta-row">
        <span class="meta-chip">💰 ${budget}</span>
        ${opp.hours_per_week ? `<span class="meta-chip">⏱ ${opp.hours_per_week} hrs/wk</span>` : ""}
        ${opp.remote_option ? `<span class="meta-chip">📍 ${opp.remote_option.replace(/_/g, " ")}</span>` : ""}
      </div>
      ${skills.length > 0 ? `
      <div>
        <div class="skills-label">Required Skills</div>
        <div class="skills-row">
          ${skills.map((s: string) => `<span class="skill-chip">${s}</span>`).join("")}
        </div>
      </div>` : ""}
    </div>

    <div class="cta-section">
      <a href="${appUrl}/dashboard/professional" class="cta">View &amp; Respond →</a>
      <p class="urgency">Respond within 48 hours to stay in consideration.</p>
    </div>

    <div class="footer">
      You received this email because you have an active professional profile on Matched.<br>
      © ${new Date().getFullYear()} Matched. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Matched <hello@matched.app>",
          to: [professionalEmail],
          subject: `${score}% match: ${opp.title}`,
          html: emailHtml,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error("Resend error:", err);
      }
    } else {
      console.log("RESEND_API_KEY not set — skipping email to", professionalEmail);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-match-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
