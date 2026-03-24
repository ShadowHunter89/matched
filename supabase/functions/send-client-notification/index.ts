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

    // Fetch match with opportunity and professional info
    const { data: match } = await supabase
      .from("matches")
      .select(`
        id, professional_id, similarity_score,
        opportunities (
          id, title, client_id
        )
      `)
      .eq("id", matchId)
      .single();

    if (!match) throw new Error("Match not found");

    const opp = match.opportunities as any;

    // Get client email
    const { data: clientUser } = await supabase.auth.admin.getUserById(opp.client_id);
    const clientEmail = clientUser?.user?.email;
    if (!clientEmail) throw new Error("Client email not found");

    // Get professional profile info
    const { data: profProfile } = await supabase
      .from("professional_profiles")
      .select("headline, skills, hourly_rate_min, hourly_rate_max")
      .eq("user_id", match.professional_id)
      .single();

    const { data: profUser } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", match.professional_id)
      .single();

    const profName = profUser?.full_name || "A professional";
    const headline = profProfile?.headline || "";
    const skills = (profProfile?.skills || []).slice(0, 5);
    const rate =
      profProfile?.hourly_rate_min && profProfile?.hourly_rate_max
        ? `$${profProfile.hourly_rate_min / 100}–$${profProfile.hourly_rate_max / 100}/hr`
        : "Flexible";
    const score = Math.round((match.similarity_score || 0) * 100);

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${profName} is interested in your ${opp.title} role</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0C0C0C; color: #ffffff; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-size: 22px; font-weight: 700; color: #E8FF47; letter-spacing: -0.5px; margin-bottom: 40px; }
    .badge { display: inline-block; background: #1e1e1e; border: 1px solid #2a2a2a; color: #888; font-size: 13px; padding: 4px 12px; border-radius: 100px; margin-bottom: 20px; }
    h1 { font-size: 26px; font-weight: 700; line-height: 1.25; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 32px; line-height: 1.5; }
    .card { background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 24px; margin-bottom: 28px; }
    .prof-name { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    .prof-headline { color: #888; font-size: 14px; margin-bottom: 20px; }
    .meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
    .meta-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 5px 11px; font-size: 13px; color: #888; }
    .score-chip { background: #E8FF47; color: #000; font-size: 13px; font-weight: 600; padding: 5px 11px; border-radius: 8px; }
    .skills-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .skill-chip { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 100px; padding: 3px 10px; font-size: 12px; color: #aaa; }
    .cta { display: inline-block; background: #E8FF47; color: #000; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 100px; text-decoration: none; margin-top: 4px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e1e1e; color: #444; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="logo">matched</div>
    <span class="badge">New interest</span>
    <h1>${profName} is interested in your role</h1>
    <p class="subtitle">
      They've accepted your <strong style="color:#fff">${opp.title}</strong> opportunity. Connect to get their contact details.
    </p>
    <div class="card">
      <div class="prof-name">${profName}</div>
      ${headline ? `<div class="prof-headline">${headline}</div>` : ""}
      <div class="meta-row">
        <span class="score-chip">${score}% match</span>
        <span class="meta-chip">${rate}</span>
      </div>
      ${skills.length > 0 ? `
      <div class="skills-row">
        ${skills.map((s: string) => `<span class="skill-chip">${s}</span>`).join("")}
      </div>` : ""}
    </div>
    <a href="${appUrl}/dashboard/client" class="cta">View interested professionals →</a>
    <div class="footer">
      You received this because you posted an opportunity on Matched.<br>
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
          to: [clientEmail],
          subject: `${profName} is interested in your ${opp.title} role`,
          html: emailHtml,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error("Resend error:", err);
      }
    } else {
      console.log("RESEND_API_KEY not set — skipping email to", clientEmail);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-client-notification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
