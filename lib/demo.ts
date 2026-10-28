import type { Plan } from "./agent";

// Hand-written placeholder plan for previewing the UI (DEMO_MODE=1). It contains no Qloo data
// and is never used in production: the real route always calls the agent.
const e = (id: string, name: string, tags: string[], because: string[], address?: string) => ({
  entity_id: id,
  name,
  tags,
  access: [] as string[],
  facts: [] as string[],
  address,
  because: because.map((n, i) => ({ id: `${id}-${i}`, name: n, score: 0.5 })),
});

const A = { d1: e("d1", "Trattoria Sample", ["Italian"], []), d2: e("d2", "Sample Tex-Mex Kitchen", ["Tex-Mex"], []), m1: e("m1", "Sample Artist One", ["Country"], []), s1: e("s1", "Sample Small-Town Sitcom", ["Comedy"], []), s2: e("s2", "Sample Classic Romance", ["Romance"], []) };

export const demoPlan: Plan = {
  week: [
    { day: "Monday", slots: [{ when: "Lunch", activity: "Soft risotto at Trattoria Sample", entity: A.d1 }, { when: "Evening", activity: "An episode of the small-town sitcom", entity: A.s1 }] },
    { day: "Tuesday", slots: [{ when: "Afternoon", activity: "Sunday-record afternoon, on a Tuesday", entity: A.m1 }] },
    { day: "Wednesday", slots: [{ when: "Lunch", activity: "Tamales and caldo, mild", entity: A.d2 }, { when: "Evening", activity: "Classic romance night", entity: A.s2 }] },
    { day: "Thursday", slots: [{ when: "Morning", activity: "Quiet morning with the records", entity: A.m1 }] },
    { day: "Friday", slots: [{ when: "Lunch", activity: "Long lunch, Italian again", entity: A.d1 }] },
  ],
  greeting: "Here is a gentle week for Margaret, built around the music, films and flavours she grew up with. (Sample data: demo mode)",
  sections: [
    {
      title: "Lunches worth lingering over",
      kind: "dining",
      intro: "Quiet, unhurried rooms with soft, flavourful dishes.",
      items: [
        { entity: e("d1", "Trattoria Sample", ["Italian", "Comfort food", "Quiet"], ["Casablanca", "Italian food"], "Austin, TX"), note: "Candlelit and calm, like the cafés in the films she loves; the menu leans on risotto and slow-braised dishes.", careNote: "Soft textures: ask for the risotto or braised short rib. Request a low-sodium preparation." },
        { entity: e("d2", "Sample Tex-Mex Kitchen", ["Tex-Mex", "Family-owned"], ["Patsy Cline", "Tex-Mex"], "Austin, TX"), note: "Honky-tonk heritage and a Patsy Cline kind of warmth.", careNote: "Order mild; the tamales and caldo are tender and easy to chew." },
        { entity: e("d3", "Sample Soup & Bread", ["Soup", "Bakery"], ["Italian food"], "Austin, TX"), note: "A cosy daytime spot for a long chat.", careNote: "Ask for the low-sodium broth options." },
      ],
    },
    {
      title: "Sunday-record afternoon",
      kind: "music",
      intro: "Artists that sit close to Patsy Cline and The Beatles in the taste graph.",
      items: [
        { entity: e("m1", "Sample Artist One", ["Country", "Classic"], ["Patsy Cline"]), note: "Same heartbreak-and-harmony tradition as her favourite singer." },
        { entity: e("m2", "Sample Artist Two", ["Pop", "60s"], ["The Beatles"]), note: "A British Invasion-era sound from her teenage years." },
      ],
    },
    {
      title: "Easy evenings",
      kind: "screen",
      intro: "Gentle shows and films from her formative decades.",
      items: [
        { entity: e("s1", "Sample Small-Town Sitcom", ["Comedy", "1960s"], ["The Andy Griffith Show"]), note: "Same unhurried small-town charm, short episodes." },
        { entity: e("s2", "Sample Classic Romance", ["Romance", "Classic"], ["Casablanca"]), note: "Wartime romance in the spirit of her favourite film." },
      ],
    },
  ],
  conversationStarters: ["Which song first made you fall in love with music?", "What was the best meal you shared with Tom?"],
  caregiverTips: ["Pick lunch over dinner: quieter rooms and softer light.", "Put the record on first, then ask about it."],
  trace: [
    { tool: "Qloo search", summary: "“Patsy Cline” → Patsy Cline (sample)" },
    { tool: "Qloo insights", summary: "place: 6 taste-matched results from 4 favourites (sample)" },
  ],
};
