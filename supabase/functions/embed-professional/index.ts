import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("userId required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile } = await supabase
      .from("professional_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!profile) throw new Error("Profile not found");

    const { data: userProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    const profileText = `
      Name: ${userProfile?.full_name || "Professional"}
      Headline: ${profile.headline || ""}
      Bio: ${profile.bio || ""}
      Skills: ${(profile.skills || []).join(", ")}
      Experience: ${profile.years_experience || 0} years
      Rate: $${(profile.hourly_rate_min || 0) / 100}-$${(profile.hourly_rate_max || 0) / 100}/hr
      Availability: ${profile.availability_hours || 0} hrs/week
      Remote preference: ${profile.remote_preference || "flexible"}
      Preferred industries: ${(profile.preferred_industries || []).join(", ")}
    `.trim();

    const embeddingRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: profileText }),
    });

    if (!embeddingRes.ok) throw new Error("Embedding generation failed");
    const { embedding } = await embeddingRes.json();

    await supabase
      .from("professional_profiles")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("user_id", userId);

    // Re-match against open opportunities
    const { data: existingMatches } = await supabase
      .from("matches")
      .select("opportunity_id")
      .eq("professional_id", userId);

    const matchedOppIds = (existingMatches || []).map((m: any) => m.opportunity_id);

    let query = supabase.from("opportunities").select("id").in("status", ["open", "matching"]);
    if (matchedOppIds.length > 0) {
      query = (query as any).not("id", "in", `(${matchedOppIds.join(",")})`);
    }
    const { data: unmatchedOpps } = await query;

    for (const opp of unmatchedOpps || []) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/match-professionals`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ opportunityId: opp.id, specificProfessionalId: userId }),
        });
      } catch (e) {
        console.error("Re-match failed for opp", opp.id, e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("embed-professional error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
