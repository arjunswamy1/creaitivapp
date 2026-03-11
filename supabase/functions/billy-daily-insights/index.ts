import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { steps } = await req.json();
    // steps: Array<{ title: string, metrics: Array<{ label, value, delta }> }>

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an expert performance marketing analyst reviewing daily funnel data for a lead-gen business (Meta ads → landing page → phone calls → revenue).

Below is today's performance data organized by funnel step. Each metric shows its current value and day-over-day % change (delta).

${steps.map((s: any) => `### ${s.title}\n${s.metrics.map((m: any) => `- ${m.label}: ${m.value} (${m.delta !== null ? (m.delta >= 0 ? '+' : '') + m.delta.toFixed(1) + '% DoD' : 'no prior day'})`).join('\n')}`).join('\n\n')}

For EACH step, provide exactly 1-2 bullet points that:
- Summarize the key trend or theme (not just repeat numbers)
- Call out anything actionable or concerning
- Use plain language a media buyer would understand
- Be specific about what's improving or degrading

Respond as valid JSON with this exact structure (no markdown, no code fences):
{"steps":[{"title":"Step 1 — Traffic","bullets":["bullet 1","bullet 2"]},{"title":"Step 2 — Landing Page","bullets":["bullet 1"]},{"title":"Step 3 — Call Processing","bullets":["bullet 1","bullet 2"]},{"title":"Step 4 — Monetization","bullets":["bullet 1"]}]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a performance marketing analyst. Return only valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response, handling potential markdown fences
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("billy-daily-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
