// Usage: node --env-file=.env.local scripts/qloo-smoke.mjs
// Prints the shape of real Qloo responses so lib/qloo.ts can be checked against them.
const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const key = process.env.QLOO_API_KEY;
if (!key) { console.error("QLOO_API_KEY missing in .env.local"); process.exit(1); }

async function get(path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "X-Api-Key": key } });
  const text = await res.text();
  console.log(`\n=== GET ${path} ${JSON.stringify(params)} -> ${res.status}`);
  try { return { status: res.status, json: JSON.parse(text) }; } catch { console.log(text.slice(0, 300)); return { status: res.status }; }
}
const keys = (o) => (o && typeof o === "object" ? Object.keys(o).slice(0, 12) : typeof o);

const s = await get("/search", { query: "Patsy Cline", types: "urn:entity:artist", take: 3 });
console.log("top-level keys:", keys(s.json), "| results keys:", keys(s.json?.results));
console.log("first result:", JSON.stringify((Array.isArray(s.json?.results) ? s.json.results : s.json?.results?.entities)?.[0], null, 1)?.slice(0, 600));
const id = (Array.isArray(s.json?.results) ? s.json.results : s.json?.results?.entities)?.[0]?.entity_id;

const t = await get("/v2/tags", { "filter.query": "italian", take: 3 });
console.log("tags shape:", keys(t.json), keys(t.json?.results), JSON.stringify(t.json?.results?.tags?.[0] ?? t.json?.results?.[0])?.slice(0, 300));

const i = await get("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": id ?? "", "filter.location.query": "Austin, Texas", "feature.explainability": "true", take: 3 });
const ent = i.json?.results?.entities?.[0];
console.log("entity keys:", keys(ent));
console.log("name/tags/image/address:", ent?.name, "|", JSON.stringify(ent?.tags?.slice(0, 2)), "|", ent?.properties?.image, "|", ent?.properties?.address);
console.log("explainability:", JSON.stringify(ent?.query?.explainability ?? i.json?.query?.explainability)?.slice(0, 500));
