import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  try {
    const { opportunityId, specificProfessionalId } = await req.json();
    if (!opportunityId) throw new Error("opportunityId required");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Matching for opportunity:", opportunityId);
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", opportunityId)
      .single();
    if (oppError || !opportunity) {
      throw new Error(`Opportunity not found: ${oppError?.message}`);
    }
    console.log("Opportunity:", opportunity.title);
    let matchesCreated = 0;
    let usedVector = false;
    let oppEmbedding = opportunity.embedding;
    if (!oppEmbedding) {
      try {
        const oppText = `
          Title: ${opportunity.title}
          Description: ${opportunity.description || ""}
          Skills: ${(opportunity.required_skills || []).join(", ")}
          Budget: $${(opportunity.budget_min || 0)/100}-$${(opportunity.budget_max || 0)/100}/hr
          Hours: ${opportunity.hours_per_week || "flexible"}/week
          Remote: ${opportunity.remote_option || "flexible"}
        `.trim();
        const embRes = await fetch(
          `${supabaseUrl}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: oppText }),
          }
        );
        if (embRes.ok) {
          const embData = await embRes.json();
          oppEmbedding = embData.embedding;
          await supabase
            .from("opportunities")
            .update({ embedding: JSON.stringify(oppEmbedding) })
            .eq("id", opportunityId);
          console.log("Opportunity embedding generated");
        } else {
          console.error("Embedding failed:", await embRes.text());
        }
      } catch (e) {
        console.error("Embedding error:", e);
      }
    }
    if (oppEmbedding) {
      try {
        const { data: vectorMatches, error: rpcError } = await supabase.rpc(
          "match_professionals",
          {
            query_embedding: oppEmbedding,
            budget_max: opportunity.budget_max || 999999999,
            budget_min: opportunity.budget_min || 0,
            required_hours: opportunity.hours_per_week || 0,
            remote_option: opportunity.remote_option || "flexible",
            match_limit: specificProfessionalId ? 100 : 5,
          }
        );
        console.log(
          "Vector matches:", vectorMatches?.length || 0,
          rpcError?.message || ""
        );
        if (!rpcError && vectorMatches && vectorMatches.length > 0) {
          const toMatch = specificProfessionalId
            ? vectorMatches.filter(
                (m: any) =>
                  m.user_id === specificProfessionalId && m.similarity > 0.2
              )
            : vectorMatches;
          for (const match of toMatch) {
            const { data: existing } = await supabase
              .from("matches")
              .select("id")
              .eq("opportunity_id", opportunityId)
              .eq("professional_id", match.user_id)
              .maybeSingle();
            if (!existing) {
              const { data: inserted, error: insertErr } = await supabase
                .from("matches")
                .insert({
                  opportunity_id: opportunityId,
                  professional_id: match.user_id,
                  similarity_score: match.similarity,
                  status: "pending",
                })
                .select()
                .single();
              if (insertErr) {
                console.error("Insert error:", insertErr.message);
              } else if (inserted) {
                matchesCreated++;
                fetch(`${supabaseUrl}/functions/v1/send-match-email`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ matchId: inserted.id }),
                }).catch(e => console.error("Email failed:", e));
              }
            }
          }
          if (matchesCreated > 0) usedVector = true;
        }
      } catch (e) {
        console.error("Vector matching error:", e);
      }
    }
    if (matchesCreated === 0) {
      console.log("Running skill-based fallback");
      let profQuery = supabase.from("professional_profiles").select("*");
      if (specificProfessionalId) {
        profQuery = profQuery.eq("user_id", specificProfessionalId);
      }
      const { data: professionals } = await profQuery;
      console.log("Professionals available:", professionals?.length || 0);
      const scored = (professionals || [])
        .map((prof: any) => {
          let score = 0;
          const required = (opportunity.required_skills || [])
            .map((s: string) => s.toLowerCase());
          const profSkills = (prof.skills || [])
            .map((s: string) => s.toLowerCase());
          if (required.length > 0) {
            const overlap = required.filter((s: string) =>
              profSkills.includes(s)
            ).length;
            score += (overlap / required.length) * 50;
          } else {
            score += 25;
          }
          if (
            opportunity.budget_min && opportunity.budget_max &&
            prof.hourly_rate_min && prof.hourly_rate_max
          ) {
            const rateOverlap =
              Math.min(opportunity.budget_max, prof.hourly_rate_max) -
              Math.max(opportunity.budget_min, prof.hourly_rate_min);
            score += rateOverlap > 0 ? 20 : 5;
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
            !opportunity.remote_option ||
            opportunity.remote_option === "flexible" ||
            prof.remote_preference === "flexible" ||
            opportunity.remote_option === prof.remote_preference
          ) {
            score += 15;
          }
          return {
            professionalId: prof.user_id,
            similarity: Math.min(score / 100, 0.99),
          };
        })
        .filter((p: any) => p.similarity > 0.1)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, 5);
      console.log("Fallback scored:", scored.length);
      for (const match of scored) {
        const { data: existing } = await supabase
          .from("matches")
          .select("id")
          .eq("opportunity_id", opportunityId)
          .eq("professional_id", match.professionalId)
          .maybeSingle();
        if (!existing) {
          const { data: inserted, error: insertErr } = await supabase
            .from("matches")
            .insert({
              opportunity_id: opportunityId,
              professional_id: match.professionalId,
              similarity_score: match.similarity,
              status: "pending",
            })
            .select()
            .single();
          if (insertErr) {
            console.error("Fallback insert error:", insertErr.message);
          } else if (inserted) {
            matchesCreated++;
            fetch(`${supabaseUrl}/functions/v1/send-match-email`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ matchId: inserted.id }),
            }).catch(e => console.error("Email failed:", e));
          }
        }
      }
    }
    await supabase
      .from("opportunities")
      .update({ status: "matching" })
      .eq("id", opportunityId);
    console.log(
      `Done: ${matchesCreated} matches, method: ${usedVector ? "vector" : "fallback"}`
    );
    return new Response(
      JSON.stringify({
        success: true,
        matchesFound: matchesCreated,
        method: usedVector ? "vector" : "fallback",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Matching error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
