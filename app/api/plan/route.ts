import { runAgent, type Profile } from "@/lib/agent";
import { demoPlan } from "@/lib/demo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Best-effort limiter (per server instance) so a public demo can't burn the API budget.
const hits = new Map<string, number[]>();
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR ?? 12);
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Streams newline-delimited JSON: {type:"step"|"plan"|"error", ...} */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  let b: any;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const loves = String(b.loves ?? "").trim().slice(0, 600);
  const birthYear = Number(b.birthYear);
  if (!loves || !Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2010) {
    return Response.json({ error: "Please add a few favourites and a valid birth year." }, { status: 400 });
  }
  if (limited(ip)) {
    return Response.json({ error: "You've reached the hourly limit for this demo. Please try again later." }, { status: 429 });
  }
  const profile: Profile = {
    name: String(b.name ?? "").slice(0, 60),
    birthYear,
    city: String(b.city ?? "").slice(0, 80),
    loves,
    needs: Array.isArray(b.needs) ? b.needs.slice(0, 10).map((n: unknown) => String(n).slice(0, 80)) : [],
    notes: String(b.notes ?? "").slice(0, 400),
    relationship: b.relationship === "caregiver" ? "caregiver" : "myself",
    rejected: Array.isArray(b.rejected)
      ? b.rejected.slice(0, 30).map((r: any) => ({ id: String(r.id).slice(0, 80), name: String(r.name).slice(0, 80) }))
      : [],
  };

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (process.env.DEMO_MODE === "1") {
          // local UI preview only; never set in production
          for (const s of demoPlan.trace) {
            await sleep(700);
            send({ type: "step", ...s });
          }
          await sleep(500);
          send({ type: "plan", plan: demoPlan });
        } else {
          const plan = await runAgent(profile, (s) => send({ type: "step", ...s }));
          send({ type: "plan", plan });
        }
      } catch (e: any) {
        console.error(e);
        send({ type: "error", error: e?.message ?? "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
