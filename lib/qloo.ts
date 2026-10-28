// Thin, defensive client for the Qloo API (hackathon base URL).
// Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

export type QlooEntity = {
  entity_id: string;
  name: string;
  types?: string[];
  description?: string;
  image?: string;
  address?: string;
  tags: string[]; // meaningful display tags (category, genre, ambience...)
  access: string[]; // accessibility facts Qloo lists (e.g. "Wheelchair accessible entrance")
  facts: string[]; // compact "type: name" facts handed to the agent; it may only claim what is listed here
  /** Input entities that drove this recommendation, from feature.explainability. */
  because: { id: string; name?: string; score: number }[];
};

async function get(path: string, params: Record<string, string | number | undefined>) {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is not set");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { "X-Api-Key": key }, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qloo ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const SHOW_ORDER = ["category", "genre", "cuisine", "ambience", "interests"];
const FACT_TYPES = ["category", "genre", "cuisine", "ambience", "accessibility", "time_of_day_fit", "setting", "decor", "amenity", "dining_options", "activity_type"];

/** Qloo returns 100+ tags per place, mixed with noise (payments, parking). Keep the ones that matter for care. */
function digestTags(raw: any[]) {
  const tags = (raw ?? []).map((t) => ({ kind: String(t.type ?? "").split(":")[2] ?? "", name: String(t.name ?? "") })).filter((t) => t.name);
  const uniq = (xs: string[]) => [...new Set(xs)];
  const show = uniq(
    SHOW_ORDER.flatMap((k) => tags.filter((t) => t.kind === k && t.name !== "Place").map((t) => t.name)),
  ).slice(0, 4);
  const access = uniq(tags.filter((t) => t.kind === "accessibility").map((t) => t.name)).slice(0, 4);
  const facts = uniq(tags.filter((t) => FACT_TYPES.includes(t.kind) && t.name !== "Place").map((t) => `${t.kind}: ${t.name}`)).slice(0, 24);
  return { show, access, facts };
}

/** Resolve a free-text name to Qloo entity IDs. */
export async function searchEntities(query: string, type?: string, take = 5) {
  const data = await get("/search", { query, types: type, take });
  const rows: any[] = Array.isArray(data?.results) ? data.results : data?.results?.entities ?? [];
  return rows.slice(0, take).map((r) => ({
    entity_id: String(r.entity_id ?? r.id),
    name: String(r.name),
    types: r.types as string[] | undefined,
    address: r.properties?.address as string | undefined,
  }));
}

/** Find valid tag IDs (cuisines, genres, moods) by keyword. */
export async function searchTags(query: string, take = 6) {
  const data = await get("/v2/tags", { "filter.query": query, take });
  const rows: any[] = data?.results?.tags ?? (Array.isArray(data?.results) ? data.results : []);
  return rows.slice(0, take).map((t) => ({ tag_id: String(t.id ?? t.tag_id), name: String(t.name), type: t.type as string | undefined }));
}

export type InsightsArgs = {
  filter_type: string;
  signal_entities?: string[];
  signal_tags?: string[];
  filter_tags?: string[];
  exclude_tags?: string[];
  location?: string; // locality name, e.g. "Austin, Texas"
  exclude_entities?: string[]; // picks the user rejected
  release_year_min?: number;
  release_year_max?: number;
  take?: number;
};

/** The Insights API: taste-graph recommendations with explainability. */
export async function insights(a: InsightsArgs, names: Map<string, string>): Promise<QlooEntity[]> {
  const isMedia = ["urn:entity:movie", "urn:entity:tv_show"].includes(a.filter_type);
  const data = await get("/v2/insights", {
    "filter.type": a.filter_type,
    "signal.interests.entities": a.signal_entities?.join(","),
    "signal.interests.tags": a.signal_tags?.join(","),
    "filter.tags": a.filter_tags?.join(","),
    "filter.exclude.tags": a.exclude_tags?.join(","),
    "filter.exclude.entities": a.exclude_entities?.join(","),
    "filter.location.query": a.location,
    "filter.release_year.min": isMedia ? a.release_year_min : undefined,
    "filter.release_year.max": isMedia ? a.release_year_max : undefined,
    "feature.explainability": "true",
    take: Math.min(a.take ?? 6, 12),
  });
  const rows: any[] = data?.results?.entities ?? [];
  return rows.map((r) => {
    const contrib = r?.query?.explainability;
    // Observed shape: {"signal.interests.entities": [{entity_id, score}, ...]}. Also tolerate a bare array.
    const list: any[] = Array.isArray(contrib)
      ? contrib
      : contrib && typeof contrib === "object"
        ? Object.values(contrib as Record<string, any>).flatMap((v) => (Array.isArray(v) ? v : []))
        : [];
    const pairs: [string, any][] = list.map((c) => [String(c.entity_id ?? c.id), c]);
    const because = pairs
      .map(([id, v]) => ({ id, name: names.get(id), score: typeof v === "number" ? v : Number(v?.score ?? 0) }))
      .filter((c) => c.name && c.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3);
    const d = digestTags(r.tags);
    return {
      entity_id: String(r.entity_id),
      name: String(r.name),
      types: r.types,
      description: r.properties?.description,
      image: r.properties?.image?.url,
      address: r.properties?.address,
      tags: d.show,
      access: d.access,
      facts: d.facts,
      because,
    };
  });
}
