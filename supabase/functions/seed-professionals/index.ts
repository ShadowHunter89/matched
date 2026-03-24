import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_PROFESSIONALS = [
  {
    email: "sarah.kim@test.com",
    password: "testpass123",
    fullName: "Sarah Kim",
    headline: "Fractional CTO · Ex-Stripe, Plaid",
    bio: "I've scaled engineering teams from 5 to 80 at two fintech unicorns. Strong in distributed systems, API design, and hiring.",
    skills: ["System Architecture", "Engineering Leadership", "Node.js", "React", "TypeScript", "Hiring"],
    yearsExperience: 12,
    hourlyRateMin: 20000,
    hourlyRateMax: 25000,
    availabilityHours: 20,
    remotePreference: "remote_only",
    preferredIndustries: ["Fintech", "SaaS", "AI"],
  },
  {
    email: "marcus.webb@test.com",
    password: "testpass123",
    fullName: "Marcus Webb",
    headline: "Senior Growth Engineer · 3 YC companies",
    bio: "I build and instrument growth systems — referral loops, activation experiments, onboarding optimization.",
    skills: ["Growth", "React", "Node.js", "Python", "Data Analysis", "A/B Testing"],
    yearsExperience: 8,
    hourlyRateMin: 15000,
    hourlyRateMax: 18000,
    availabilityHours: 25,
    remotePreference: "flexible",
    preferredIndustries: ["SaaS", "Consumer", "Marketplace"],
  },
  {
    email: "priya.nair@test.com",
    password: "testpass123",
    fullName: "Priya Nair",
    headline: "Fractional CFO · SaaS & Marketplace specialist",
    bio: "Former Big 4 turned operator. Led finance at 4 startups through Series A-C, including two exits.",
    skills: ["Financial Modeling", "Fundraising", "FP&A", "M&A", "Board Reporting", "Operations"],
    yearsExperience: 14,
    hourlyRateMin: 18000,
    hourlyRateMax: 22000,
    availabilityHours: 15,
    remotePreference: "remote_only",
    preferredIndustries: ["SaaS", "Fintech", "Marketplace"],
  },
  {
    email: "tom.farrell@test.com",
    password: "testpass123",
    fullName: "Tom Farrell",
    headline: "Head of Product · B2B SaaS",
    bio: "10 years shipping B2B products. Own roadmap, work directly with founders, deeply hands-on with design and engineering.",
    skills: ["Product Strategy", "Roadmapping", "User Research", "Figma", "Go-to-Market", "Analytics"],
    yearsExperience: 10,
    hourlyRateMin: 14000,
    hourlyRateMax: 18000,
    availabilityHours: 20,
    remotePreference: "remote_only",
    preferredIndustries: ["SaaS", "DevTools", "AI"],
  },
  {
    email: "lin.zhao@test.com",
    password: "testpass123",
    fullName: "Lin Zhao",
    headline: "Brand & Product Designer · Ex-Figma, Linear",
    bio: "I create design systems and brand identities that scale. Work best with early-stage teams who want premium product feel.",
    skills: ["Brand Design", "UX Design", "Design Systems", "Figma", "Typography", "Motion"],
    yearsExperience: 9,
    hourlyRateMin: 13000,
    hourlyRateMax: 17000,
    availabilityHours: 20,
    remotePreference: "remote_only",
    preferredIndustries: ["SaaS", "Consumer", "DevTools", "AI"],
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: any[] = [];

  for (const prof of TEST_PROFESSIONALS) {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: prof.email,
        password: prof.password,
        email_confirm: true,
        user_metadata: { full_name: prof.fullName },
      });

      let userId: string | undefined;

      if (authError) {
        if (authError.message.includes("already been registered")) {
          // Find existing user
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find((u) => u.email === prof.email);
          userId = existing?.id;
        } else {
          results.push({ email: prof.email, error: authError.message });
          continue;
        }
      } else {
        userId = authData?.user?.id;
      }

      if (!userId) {
        results.push({ email: prof.email, error: "Could not resolve user ID" });
        continue;
      }

      // Upsert base profile
      await supabase.from("profiles").upsert({
        user_id: userId,
        full_name: prof.fullName,
        role: "professional",
        onboarding_complete: true,
      });

      // Upsert professional profile
      await supabase.from("professional_profiles").upsert({
        user_id: userId,
        headline: prof.headline,
        bio: prof.bio,
        years_experience: prof.yearsExperience,
        hourly_rate_min: prof.hourlyRateMin,
        hourly_rate_max: prof.hourlyRateMax,
        availability_hours: prof.availabilityHours,
        remote_preference: prof.remotePreference,
        skills: prof.skills,
        preferred_industries: prof.preferredIndustries,
      });

      // Generate embedding
      try {
        await fetch(`${supabaseUrl}/functions/v1/embed-professional`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
        const { data: embCheck } = await supabase
          .from("professional_profiles")
          .select("embedding")
          .eq("user_id", userId)
          .single();
        const embeddingStored = embCheck?.embedding !== null;
        results.push({
          email: prof.email,
          status: "created",
          userId,
          embeddingStored
        });
      } catch (embedErr) {
        results.push({ email: prof.email, status: "created", userId, embeddingStored: false, embedError: String(embedErr) });
      }
    } catch (e: any) {
      results.push({ email: prof.email, error: e.message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
