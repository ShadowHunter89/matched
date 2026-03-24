import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
async function embedWithOpenRouter(
  text: string,
  apiKey: string,
  appUrl: string
): Promise<number[]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl,
      "X-Title": "Matched",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${err}`);
  }
  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error(`No embedding from OpenRouter: ${JSON.stringify(data)}`);
  }
  return embedding;
}
async function embedWithHuggingFace(
  text: string,
  apiKey: string
): Promise<number[]> {
  const res = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace error: ${res.status} ${err}`);
  }
  const data = await res.json();
  let embedding: number[] = Array.isArray(data[0]) ? data[0] : data;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error(`No embedding from HuggingFace: ${JSON.stringify(data)}`);
  }
  if (embedding.length === 384) {
    const padded = [...embedding, ...embedding, ...embedding, ...embedding];
    const magnitude = Math.sqrt(padded.reduce((sum, x) => sum + x * x, 0));
    return padded.map(x => x / magnitude);
  }
  return embedding;
}
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  try {
    const { text } = await req.json();
    if (!text) throw new Error("text required");
    const openrouterKey = Deno.env.get("OPENAI_API_KEY");
    const hfKey = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
    const appUrl = Deno.env.get("APP_URL") || "https://matched.app";
    let embedding: number[] | null = null;
    let method = "";
    let lastError = "";
    if (openrouterKey) {
      try {
        embedding = await embedWithOpenRouter(text, openrouterKey, appUrl);
        method = "openrouter";
        console.log(`OpenRouter embedding: ${embedding.length} dims`);
      } catch (e: any) {
        lastError = e.message;
        console.error("OpenRouter failed:", e.message);
      }
    }
    if (!embedding && hfKey) {
      try {
        embedding = await embedWithHuggingFace(text, hfKey);
        method = "huggingface";
        console.log(`HuggingFace embedding: ${embedding.length} dims`);
      } catch (e: any) {
        lastError = e.message;
        console.error("HuggingFace failed:", e.message);
      }
    }
    if (!embedding) {
      throw new Error(
        `All embedding methods failed. Last error: ${lastError}`
      );
    }
    return new Response(
      JSON.stringify({ embedding, method, dimensions: embedding.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-embedding error:", error);
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
