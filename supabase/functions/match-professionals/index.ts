import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { opportunityId, specificProfessionalId } = await req.json();
    if (!opportunityId) throw new Error("opportunityId required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: opportunity } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", opportunityId)
      .single();

    if (!opportunity) throw new Error("Opportunity not found");

    let oppEmbedding = opportunity.embedding;

    if (!oppEmbedding) {
      const opportunityText = `
        Title: ${opportunity.title}
        Description: ${opportunity.description}
        Required Skills: ${(opportunity.required_skills || []).join(", ")}
        Budget: $${(opportunity.budget_min || 0) / 100}-$${(opportunity.budget_max || 0) / 100}/hr
        Hours per week: ${opportunity.hours_per_week || "flexible"}
        Remote: ${opportunity.remote_option || "flexible"}
        Duration: ${opportunity.duration_weeks ? opportunity.duration_weeks + " weeks" : "ongoing"}
      `.trim();

      const embeddingRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: opportunityText }),
      });

      if (embeddingRes.ok) {
        const result = await embeddingRes.json();
        oppEmbedding = result.embedding;
        await supabase
          .from("opportunities")
          .update({ embedding: JSON.stringify(oppEmbedding) })
          .eq("id", opportunityId);
      }
    }

    let matchesCreated = 0;

    if (oppEmbedding) {
      const { data: vectorMatches } = await supabase.rpc("match_professionals", {
        query_embedding: oppEmbedding,
        budget_max: opportunity.budget_max || 999999999,
        budget_min: opportunity.budget_min || 0,
        required_hours: opportunity.hours_per_week || 0,
        remote_option: opportunity.remote_option || "flexible",
        match_limit: specificProfessionalId ? 100 : 5,
      });

      const matches = specificProfessionalId
        ? (vectorMatches || []).filter(
            (m: any) => m.user_id === specificProfessionalId && m.similarity > 0.3
          )
        : vectorMatches || [];

      for (const match of matches) {
        const { data: existing } = await supabase
          .from("matches")
          .select("id")
          .eq("opportunity_id", opportunityId)
          .eq("professional_id", match.user_id)
          .maybeSingle();

        if (!existing) {
          const { data: insertedMatch } = await supabase
            .from("matches")
            .insert({
              opportunity_id: opportunityId,
              professional_id: match.user_id,
              similarity_score: match.similarity,
              status: "pending",
            })
            .select()
            .single();

          if (insertedMatch) {
            matchesCreated++;
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-match-email`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ matchId: insertedMatch.id }),
              });
            } catch (e) {
              console.error("Email notification failed:", e);
            }
          }
        }
      }
    } else {
      // Fallback: skill-based matching
      const { data: professionals } = await supabase.from("professional_profiles").select("*");

      const scored = (professionals || [])
        .map((prof: any) => {
          let score = 0;
          const required = (opportunity.required_skills || []).map((s: string) => s.toLowerCase());
          const profSkills = (prof.skills || []).map((s: string) => s.toLowerCase());

          if (required.length > 0) {
            const overlap = required.filter((s: string) => profSkills.includes(s)).length;
            score += (overlap / required.length) * 50;
          } else {
            score += 25;
          }

          if (
            opportunity.budget_min && opportunity.budget_max &&
            prof.hourly_rate_min && prof.hourly_rate_max
          ) {
            const overlap =
              Math.min(opportunity.budget_max, prof.hourly_rate_max) -
              Math.max(opportunity.budget_min, prof.hourly_rate_min);
            score += overlap > 0 ? 20 : 5;
          } else {
            score += 10;
          }

          if (opportunity.hours_per_week && prof.availability_hours) {
            score +=
              prof.availability_hours >= opportunity.hours_per_week
                ? 15
                : (prof.availability_hours / opportunity.hours_per_week) * 15;
          } else {
            score += 7;
          }

          if (
            opportunity.remote_option === "flexible" ||
            prof.remote_preference === "flexible" ||
            opportunity.remote_option === prof.remote_preference
          ) {
            score += 15;
          }

          return { professionalId: prof.user_id, similarity: score / 100 };
        })
        .filter((p: any) => p.similarity > 0.2)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, 5);

      for (const match of scored) {
        const { data: existing } = await supabase
          .from("matches")
          .select("id")
          .eq("opportunity_id", opportunityId)
          .eq("professional_id", match.professionalId)
          .maybeSingle();

        if (!existing) {
          const { data: insertedMatch } = await supabase
            .from("matches")
            .insert({
              opportunity_id: opportunityId,
              professional_id: match.professionalId,
              similarity_score: match.similarity,
              status: "pending",
            })
            .select()
            .single();

          if (insertedMatch) matchesCreated++;
        }
      }
    }

    await supabase
      .from("opportunities")
      .update({ status: "matching" })
      .eq("id", opportunityId);

    return new Response(
      JSON.stringify({ success: true, matchesFound: matchesCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Matching error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
