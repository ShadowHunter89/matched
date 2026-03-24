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
    const budget =
      opp.budget_min && opp.budget_max
        ? `$${opp.budget_min / 100}–$${opp.budget_max / 100}/hr`
        : "Flexible";
    const skills = (opp.required_skills || []).slice(0, 4);

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${score}% match: ${opp.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0C0C0C; color: #ffffff; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-size: 22px; font-weight: 700; color: #E8FF47; letter-spacing: -0.5px; margin-bottom: 40px; }
    .score-pill { display: inline-block; background: #E8FF47; color: #000; font-size: 13px; font-weight: 600; padding: 4px 14px; border-radius: 100px; margin-bottom: 20px; }
    h1 { font-size: 28px; font-weight: 700; line-height: 1.2; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 32px; line-height: 1.5; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 24px; margin-bottom: 28px; }
    .opp-title { font-size: 18px; font-weight: 600; margin-bottom: 10px; }
    .opp-desc { color: #888; font-size: 14px; line-height: 1.65; margin-bottom: 20px; }
    .meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .meta-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 5px 11px; font-size: 13px; color: #888; }
    .skills-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .skill-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 100px; padding: 3px 10px; font-size: 12px; color: #aaa; }
    .cta { display: inline-block; background: #E8FF47; color: #000; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 100px; text-decoration: none; margin-top: 4px; }
    .expires { color: #555; font-size: 13px; margin-top: 14px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e1e; color: #444; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">matched</div>
    <div class="score-pill">${score}% match</div>
    <h1>Hey ${name}, you've been matched</h1>
    <p class="subtitle">
      A new opportunity fits your profile. You're one of ${score > 85 ? "3" : "5"} professionals selected.
    </p>
    <div class="card">
      <div class="opp-title">${opp.title}</div>
      <div class="opp-desc">${(opp.description || "").slice(0, 200)}${(opp.description || "").length > 200 ? "..." : ""}</div>
      <div class="meta-row">
        <span class="meta-chip">${budget}</span>
        ${opp.hours_per_week ? `<span class="meta-chip">${opp.hours_per_week} hrs/wk</span>` : ""}
        ${opp.remote_option ? `<span class="meta-chip">${opp.remote_option.replace(/_/g, " ")}</span>` : ""}
      </div>
      ${skills.length > 0 ? `
      <div class="skills-row">
        ${skills.map((s: string) => `<span class="skill-chip">${s}</span>`).join("")}
      </div>` : ""}
    </div>
    <a href="${appUrl}/dashboard/professional" class="cta">View opportunity →</a>
    <p class="expires">This opportunity expires in 48 hours.</p>
    <div class="footer">
      You received this because you have an active profile on Matched.<br>
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
