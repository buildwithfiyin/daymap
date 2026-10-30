// Holds the Anthropic key server-side. The browser never sees it.
// Set ANTHROPIC_API_KEY in Netlify: Site configuration > Environment variables.

const DAILY_LIMIT = 15;          // requests per visitor per day
const MAX_PROMPT_CHARS = 3000;
const MAX_TOKENS = 1000;
const MODEL = "claude-haiku-5-5";

// Best-effort limiter. It resets when the function instance restarts,
// so also set a monthly spend limit in the Anthropic console.
const hits = new Map();

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${day}`;
  const count = (hits.get(key) || 0) + 1;
  hits.set(key, count);
  if (hits.size > 5000) hits.clear();
  if (count > DAILY_LIMIT) {
    return Response.json({ error: { message: "Daily limit reached. Come back tomorrow." } }, { status: 429 });
  }

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: { message: "Bad request" } }, { status: 400 }); }

  const prompt = String(body.prompt || "");
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return Response.json({ error: { message: "Prompt missing or too long" } }, { status: 400 });
  }
  const maxTokens = Math.min(Number(body.maxTokens) || 500, MAX_TOKENS);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Netlify.env.get("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
};
