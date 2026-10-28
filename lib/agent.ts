import Anthropic from "@anthropic-ai/sdk";
import { insights, searchEntities, searchTags, type QlooEntity } from "./qloo";

export type Profile = {
  name: string;
  birthYear: number;
  city: string;
  loves: string; // free text: favourite music, films, foods, places
  needs: string[]; // e.g. "soft / easy to chew"
  notes: string;
  relationship: "myself" | "caregiver";
  rejected: { id: string; name: string }[]; // picks the user said are not for them
};

export type PlanItem = { entity: QlooEntity; note: string; careNote?: string };
export type WeekDay = { day: string; slots: { when: string; activity: string; entity: QlooEntity }[] };
export type Step = { tool: string; summary: string };
export type Plan = {
  greeting: string;
  week: WeekDay[];
  sections: { title: string; kind: string; intro: string; items: PlanItem[] }[];
  conversationStarters: string[];
  caregiverTips: string[];
  trace: Step[];
};

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

const TYPES = ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:place", "urn:entity:book", "urn:entity:podcast", "urn:entity:brand", "urn:entity:destination"];

const tools: Anthropic.Tool[] = [
  {
    name: "search_entities",
    description: "Resolve a name the person mentioned (an artist, film, restaurant, dish brand...) to a Qloo entity ID. Always do this before using it as a taste signal.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, type: { type: "string", enum: TYPES, description: "Optional entity type to narrow the search" } },
      required: ["query"],
    },
  },
  {
    name: "search_tags",
    description: "Find valid Qloo tag IDs by keyword (cuisines, genres, moods, dietary-style tags like 'soup', 'comfort food', 'jazz'). Tag IDs are required for filter/exclude/signal tag parameters.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_insights",
    description: "Ask Qloo's taste graph for recommendations. Pass the person's resolved favourite entities as signals so results are cross-domain: e.g. music + films they love can steer which restaurants or TV shows fit them. Returns entities with IDs; only entities returned here can go in the final plan.",
    input_schema: {
      type: "object",
      properties: {
        filter_type: { type: "string", enum: TYPES },
        signal_entities: { type: "array", items: { type: "string" }, description: "Qloo entity IDs of things the person loves" },
        signal_tags: { type: "array", items: { type: "string" } },
        filter_tags: { type: "array", items: { type: "string" }, description: "Only return entities with these tag IDs" },
        exclude_tags: { type: "array", items: { type: "string" }, description: "Drop entities with these tag IDs (use for dietary or comfort constraints)" },
        location: { type: "string", description: "Locality name for place results, e.g. 'Austin, Texas'" },
        release_year_min: { type: "integer", description: "Movies/TV only: earliest release year (use for era-appropriate nostalgia)" },
        release_year_max: { type: "integer" },
        take: { type: "integer", minimum: 1, maximum: 12 },
      },
      required: ["filter_type"],
    },
  },
  {
    name: "submit_plan",
    description: "Submit the final plan. Every entity_id must come from a get_insights result in this conversation.",
    input_schema: {
      type: "object",
      properties: {
        greeting: { type: "string", description: "One warm sentence addressed to the reader" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              kind: { type: "string", enum: ["dining", "music", "screen", "outing", "reading"] },
              intro: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entity_id: { type: "string" },
                    note: { type: "string", description: "Why this fits THIS person, citing their tastes and era" },
                    care_note: { type: "string", description: "Practical fit for their needs (texture, noise, accessibility...). Omit if none." },
                  },
                  required: ["entity_id", "note"],
                },
              },
            },
            required: ["title", "kind", "intro", "items"],
          },
        },
        week: {
          type: "array",
          description: "5-7 days, each with 2-3 gentle slots. At most one outing per day.",
          items: {
            type: "object",
            properties: {
              day: { type: "string", description: "Monday..Sunday" },
              slots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    when: { type: "string", enum: ["Morning", "Lunch", "Afternoon", "Evening"] },
                    activity: { type: "string", description: "Short, concrete: 'Lunch at X, then ...'" },
                    entity_id: { type: "string" },
                  },
                  required: ["when", "activity", "entity_id"],
                },
              },
            },
            required: ["day", "slots"],
          },
        },
        conversation_starters: { type: "array", items: { type: "string" } },
        caregiver_tips: { type: "array", items: { type: "string" } },
      },
      required: ["greeting", "sections", "week", "conversation_starters", "caregiver_tips"],
    },
  },
];

function systemPrompt(p: Profile) {
  const era = `${p.birthYear + 15}-${p.birthYear + 30}`;
  return `You are Evergreen, a care companion that plans meals, music, screen time and outings for older adults around what they genuinely love, using Qloo's taste graph (250M+ entities). Qloo is your only source of recommendations: never recommend anything that did not come back from get_insights.

Method:
1. Resolve the person's favourites with search_entities (a handful is enough; do several calls in one turn).
2. Use get_insights with those entity IDs as signals. Exploit cross-domain taste: music and film taste should steer dining and outing picks, and vice versa.
3. Era matters: ${p.name || "the person"} was born in ${p.birthYear}; formative years were roughly ${era}. For movies/TV use release_year_min/max in that window so the picks feel nostalgic, plus one or two newer ones.
4. Needs are constraints, not afterthoughts. Translate them into search_tags + exclude_tags / filter_tags where a sensible tag exists, and add a care_note per item. Dining needs include texture, sodium, sugar, spice and heat. You are NOT a clinician: never give medical or medication advice; tell them to confirm with their doctor or dietitian when a need is medical.
Each get_insights result carries a "facts" list of real Qloo attributes. Accessibility and atmosphere claims (wheelchair access, quiet, relaxing, scenic...) must come from an entity's facts; if Qloo does not list it, say it is worth calling ahead to confirm rather than asserting it.
5. Produce 3-4 sections (dining near ${p.city || "them"} is required if a city was given, plus music, screen, and an outing or reading), 3-4 items each, then build a 5-7 day "week" that spreads those same picks into a realistic, gentle rhythm (rest days are fine; never schedule two outings in a day), then call submit_plan. Notes must be specific to this person, 1-2 sentences, warm and plain-spoken.
${p.rejected.length ? `The person rejected these earlier picks, so do not suggest them or very close alternatives: ${p.rejected.map((r) => r.name).join(", ")}.
` : ""}Speak to ${p.relationship === "caregiver" ? "the caregiver about their loved one" : "the person directly"}.`;
}

export async function runAgent(p: Profile, emit: (s: Step) => void = () => {}): Promise<Plan> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic();
  const names = new Map<string, string>(); // entity_id -> name, for explainability
  const pool = new Map<string, QlooEntity>(); // everything Qloo returned; the plan may only cite these
  const trace: Step[] = [];
  const rejectedIds = p.rejected.map((r) => r.id);
  const step = (tool: string, summary: string) => {
    trace.push({ tool, summary });
    emit({ tool, summary });
  };

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Profile
- Name: ${p.name || "(not given)"}
- Born: ${p.birthYear}
- City: ${p.city || "(not given)"}
- Loves: ${p.loves}
- Needs: ${p.needs.length ? p.needs.join("; ") : "none listed"}
- Notes: ${p.notes || "none"}`,
    },
  ];

  for (let turn = 0; turn < 10; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt(p),
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!calls.length) break;

    const submit = calls.find((c) => c.name === "submit_plan");
    if (submit) {
      try {
        return buildPlan(submit.input as any, pool, trace, new Set(rejectedIds));
      } catch (e: any) {
        // Self-heal: tell the model what was wrong and let it resubmit (bounded by the turn limit).
        step("Evergreen", "Re-checking picks against Qloo results");
        messages.push({
          role: "user",
          content: calls.map((c) => ({
            type: "tool_result" as const,
            tool_use_id: c.id,
            is_error: true,
            content: c.id === submit.id
              ? `Rejected: ${e.message} Every entity_id must be copied exactly from a get_insights result's entity_id field. Call get_insights if you need more, then submit_plan again.`
              : "Skipped; fix submit_plan first.",
          })),
        });
        continue;
      }
    }

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      calls.map(async (c) => {
        try {
          const out = await execTool(c.name, c.input as any, names, pool, step, rejectedIds);
          return { type: "tool_result" as const, tool_use_id: c.id, content: JSON.stringify(out) };
        } catch (e: any) {
          step(c.name, `error: ${e.message}`);
          return { type: "tool_result" as const, tool_use_id: c.id, content: `Error: ${e.message}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error("The agent did not produce a plan. Please try again.");
}

async function execTool(name: string, a: any, names: Map<string, string>, pool: Map<string, QlooEntity>, step: (t: string, s: string) => void, rejectedIds: string[]) {
  if (name === "search_entities") {
    const r = await searchEntities(a.query, a.type);
    r.forEach((e) => names.set(e.entity_id, e.name));
    step("Qloo search", `“${a.query}” → ${r[0]?.name ?? "no match"}`);
    return r;
  }
  if (name === "search_tags") {
    const r = await searchTags(a.query);
    step("Qloo tags", `“${a.query}” → ${r.slice(0, 3).map((t) => t.name).join(", ") || "none"}`);
    return r;
  }
  if (name === "get_insights") {
    const r = await insights({ ...a, exclude_entities: [...(a.exclude_entities ?? []), ...rejectedIds] }, names);
    r.forEach((e) => {
      pool.set(e.entity_id, e);
      names.set(e.entity_id, e.name);
    });
    const kind = String(a.filter_type).replace("urn:entity:", "");
    step("Qloo insights", `${kind}: ${r.length} taste-matched results${a.signal_entities?.length ? ` from ${a.signal_entities.length} favourites` : ""}`);
    return r.map((e) => ({ entity_id: e.entity_id, name: e.name, address: e.address, about: e.description?.slice(0, 160), facts: e.facts }));
  }
  throw new Error(`Unknown tool ${name}`);
}

function buildPlan(input: any, rawPool: Map<string, QlooEntity>, trace: Step[], rawRejected: Set<string>): Plan {
  // Models sometimes change the case or whitespace of UUIDs; match on a canonical form.
  const canon = (id: unknown) => String(id ?? "").trim().toUpperCase();
  const pool = new Map([...rawPool].map(([k, v]) => [canon(k), v] as const));
  const rejected = new Set([...rawRejected].map(canon));
  const lookup = (id: unknown) => pool.get(canon(id));
  const unknown = new Set<string>();
  const sections = (input.sections ?? [])
    .map((s: any) => ({
      title: String(s.title),
      kind: String(s.kind),
      intro: String(s.intro),
      // Grounding guard: drop anything Qloo never returned.
      items: (s.items ?? [])
        .filter((i: any) => (lookup(i.entity_id) ? !rejected.has(canon(i.entity_id)) : (unknown.add(String(i.entity_id)), false)))
        .map((i: any) => ({ entity: lookup(i.entity_id)!, note: String(i.note), careNote: i.care_note ? String(i.care_note) : undefined })),
    }))
    .filter((s: any) => s.items.length);
  if (unknown.size) console.warn(`[grounding] dropped ${unknown.size} ids not returned by Qloo: ${[...unknown].slice(0, 4).join(", ")} (pool ${pool.size})`);
  if (!sections.length) throw new Error("No Qloo-grounded recommendations were produced. Try adding more favourites.");
  const week = (input.week ?? [])
    .map((d: any) => ({
      day: String(d.day),
      slots: (d.slots ?? [])
        .filter((x: any) => (lookup(x.entity_id) ? !rejected.has(canon(x.entity_id)) : (unknown.add(String(x.entity_id)), false)))
        .map((x: any) => ({ when: String(x.when), activity: String(x.activity), entity: lookup(x.entity_id)! })),
    }))
    .filter((d: any) => d.slots.length);
  return {
    greeting: String(input.greeting ?? ""),
    week: week.length >= 3 ? week : fallbackWeek(sections),
    sections,
    conversationStarters: input.conversation_starters ?? [],
    caregiverTips: input.caregiver_tips ?? [],
    trace,
  };
}

/** If the model skipped the week or its IDs were rejected, spread the already-grounded picks over a gentle week. */
function fallbackWeek(sections: Plan["sections"]): WeekDay[] {
  const pick = (kind: string) => sections.filter((s) => s.kind === kind).flatMap((s) => s.items.map((i) => i.entity));
  const dining = pick("dining"), music = pick("music"), screen = pick("screen"), outing = [...pick("outing"), ...pick("reading")];
  const at = <T,>(xs: T[], i: number) => (xs.length ? xs[i % xs.length] : undefined);
  // [day, slots...] where each slot is [when, verb, source list, index]
  const plan: [string, [string, string, QlooEntity[], number][]][] = [
    ["Monday", [["Lunch", "Lunch at", dining, 0], ["Evening", "Watch", screen, 0]]],
    ["Tuesday", [["Morning", "Gentle outing:", outing, 0], ["Afternoon", "Put on", music, 0]]],
    ["Wednesday", [["Lunch", "Lunch at", dining, 1], ["Evening", "Watch", screen, 1]]],
    ["Thursday", [["Afternoon", "Put on", music, 1]]],
    ["Friday", [["Lunch", "Lunch at", dining, 2], ["Evening", "Watch", screen, 2]]],
    ["Saturday", [["Morning", "Gentle outing:", outing, 1], ["Afternoon", "Put on", music, 2]]],
    ["Sunday", [["Lunch", "Relaxed lunch at", dining, 3], ["Evening", "Watch", screen, 3]]],
  ];
  return plan
    .map(([day, slots]) => ({
      day,
      slots: slots.flatMap(([when, verb, list, i]) => {
        const entity = at(list, i);
        return entity ? [{ when, activity: `${verb} ${entity.name}`, entity }] : [];
      }),
    }))
    .filter((d) => d.slots.length);
}
