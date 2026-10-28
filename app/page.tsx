"use client";
import { useEffect, useRef, useState } from "react";
import type { Plan, Step } from "@/lib/agent";

const NEEDS = [
  "Soft / easy-to-chew food",
  "Low sodium",
  "Low sugar / diabetic-friendly",
  "Mild, no spice",
  "Vegetarian",
  "Needs quiet, low-noise places",
  "Limited mobility / step-free",
  "Hearing difficulty",
];

const EXAMPLE = {
  name: "Margaret",
  birthYear: "1948",
  city: "Austin, Texas",
  loves: "Patsy Cline, The Beatles, Casablanca, The Andy Griffith Show, Italian food, Tex-Mex",
  notes: "Loves a good chat over lunch. Misses her husband's Sunday records.",
  relationship: "caregiver",
  needs: ["Soft / easy-to-chew food", "Low sodium", "Needs quiet, low-noise places"],
};

const BLANK = { name: "", birthYear: "", city: "", loves: "", notes: "", relationship: "myself", needs: [] as string[] };
type Rejected = { id: string; name: string };
const KIND_ICON: Record<string, string> = { dining: "🍽", music: "♪", screen: "▶", outing: "☀", reading: "📖" };
const WHEN_ORDER = ["Morning", "Lunch", "Afternoon", "Evening"];

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export default function Home() {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [pending, setPending] = useState<Rejected[]>([]); // rejected since the last refresh
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);
  const planRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = store.get("evergreen.profile");
    if (saved) { try { setF({ ...BLANK, ...JSON.parse(saved) }); } catch { /* ignore */ } }
    setBig(store.get("evergreen.big") === "1");
  }, []);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (n: string) => setF((s) => ({ ...s, needs: s.needs.includes(n) ? s.needs.filter((x) => x !== n) : [...s.needs, n] }));
  const toggleBig = () => { setBig((b) => { store.set("evergreen.big", b ? "0" : "1"); return !b; }); };

  async function run(rej: Rejected[]) {
    setBusy(true); setErr(""); setSteps([]); setPending([]);
    store.set("evergreen.profile", JSON.stringify(f));
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, rejected: rej }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const m = JSON.parse(line);
          if (m.type === "step") setSteps((s) => [...s, { tool: m.tool, summary: m.summary }]);
          else if (m.type === "plan") { setPlan(m.plan); setTimeout(() => planRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }
          else if (m.type === "error") throw new Error(m.error);
        }
      }
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => { e.preventDefault(); setRejected([]); setPlan(null); run([]); };
  const reject = (id: string, name: string) => { const r = { id, name }; setRejected((x) => [...x, r]); setPending((x) => [...x, r]); };
  const undo = () => { setRejected((x) => x.filter((r) => !pending.some((p) => p.id === r.id))); setPending([]); };
  const hidden = new Set(rejected.map((r) => r.id));

  function asText(p: Plan) {
    const lines = [`Evergreen plan${f.name ? ` for ${f.name}` : ""}`, "", p.greeting, ""];
    for (const d of p.week) {
      lines.push(d.day);
      for (const s of d.slots.filter((s) => !hidden.has(s.entity.entity_id))) lines.push(`  ${s.when}: ${s.activity}`);
    }
    lines.push("", "Conversation starters:", ...p.conversationStarters.map((c) => `- ${c}`), "", "Tips:", ...p.caregiverTips.map((c) => `- ${c}`));
    return lines.join("\n");
  }
  async function copy() {
    if (!plan) return;
    try { await navigator.clipboard.writeText(asText(plan)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr("Couldn't copy; use Print instead."); }
  }

  const sections = plan?.sections.map((s) => ({ ...s, items: s.items.filter((i) => !hidden.has(i.entity.entity_id)) })).filter((s) => s.items.length) ?? [];

  return (
    <main className={`wrap ${big ? "big" : ""}`}>
      <div className="topbar">
        <span className="brand">Evergreen</span>
        <button type="button" className="ghost sm" aria-pressed={big} onClick={toggleBig}>{big ? "Normal text" : "Larger text"}</button>
      </div>
      <header className="hero">
        <h1>Care that knows what they love.</h1>
        <p>Tell us a few favourites and Evergreen plans a gentle week of meals, music, shows and outings that feel like <em>them</em>, adapted to how they eat and move today. Powered by Qloo&rsquo;s taste graph.</p>
      </header>

      <form className="card noprint" onSubmit={submit}>
        <div className="row">
          <div><label htmlFor="n">Their first name</label><input id="n" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Margaret" /></div>
          <div><label htmlFor="b">Year born</label><input id="b" inputMode="numeric" value={f.birthYear} onChange={(e) => set("birthYear", e.target.value)} placeholder="1948" required /></div>
          <div><label htmlFor="c">City</label><input id="c" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Austin, Texas" /></div>
        </div>
        <label htmlFor="l">Things they love <span className="hint">music, films, shows, foods, places. Names work best.</span></label>
        <textarea id="l" value={f.loves} onChange={(e) => set("loves", e.target.value)} placeholder="Patsy Cline, Casablanca, Italian food…" required />
        <label>Everyday needs</label>
        <div className="chips" role="group" aria-label="Everyday needs">
          {NEEDS.map((n) => (
            <button type="button" key={n} aria-pressed={f.needs.includes(n)} className={`chip ${f.needs.includes(n) ? "on" : ""}`} onClick={() => toggle(n)}>{n}</button>
          ))}
        </div>
        <label htmlFor="o">Anything else we should know?</label>
        <input id="o" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Enjoys long lunches, dislikes loud rooms…" />
        <label htmlFor="r">I&rsquo;m planning this for</label>
        <select id="r" value={f.relationship} onChange={(e) => set("relationship", e.target.value)}>
          <option value="myself">Myself</option>
          <option value="caregiver">Someone I care for</option>
        </select>
        <div className="btns">
          <button className="primary" disabled={busy}>{busy && <span className="spin" />}{busy ? "Planning…" : "Plan their week"}</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setF(EXAMPLE)}>Fill in an example</button>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
      </form>

      {busy && (
        <div className="card noprint live" aria-live="polite">
          <h2>Evergreen is working</h2>
          <ul className="steps">
            {steps.map((s, i) => <li key={i}><span className="dot">✓</span><b>{s.tool}</b> {s.summary}</li>)}
            <li className="now"><span className="spin dark" />Thinking about what fits…</li>
          </ul>
        </div>
      )}

      {plan && (
        <section ref={planRef} className="plan">
          <div className="card"><p className="greet">{plan.greeting}</p>
            <div className="btns noprint" style={{ marginTop: 14 }}>
              <button type="button" className="ghost sm" onClick={() => window.print()}>Print this plan</button>
              <button type="button" className="ghost sm" onClick={copy}>{copied ? "Copied ✓" : "Copy as text"}</button>
            </div>
          </div>

          {plan.week.length > 0 && (
            <div className="card">
              <h2>Their week</h2>
              <div className="week">
                {plan.week.map((d) => {
                  const slots = d.slots.filter((s) => !hidden.has(s.entity.entity_id)).sort((a, b) => WHEN_ORDER.indexOf(a.when) - WHEN_ORDER.indexOf(b.when));
                  return (
                    <div className="day" key={d.day}>
                      <h3>{d.day}</h3>
                      {slots.length ? slots.map((s, i) => (
                        <div className="slot" key={i}><span className="when">{s.when}</span>{s.activity}</div>
                      )) : <div className="sub">A restful day.</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sections.map((s) => (
            <div className="card" key={s.title}>
              <h2><span className="ico" aria-hidden>{KIND_ICON[s.kind] ?? "•"}</span>{s.title}</h2>
              <p className="sub">{s.intro}</p>
              <div className="grid">
                {s.items.map(({ entity: e, note, careNote }) => (
                  <article className="item" key={e.entity_id}>
                    {e.image ? <img src={e.image} alt="" loading="lazy" /> : <div className="ph" />}
                    <div className="body">
                      <h3>{e.name}</h3>
                      {e.address && <div className="sub">{e.address}</div>}
                      <p style={{ margin: "6px 0 0" }}>{note}</p>
                      {careNote && <div className="care">{careNote}</div>}
                      {e.because.length > 0 && <div className="why">Qloo matched this to: {e.because.map((b) => b.name).join(", ")}</div>}
                      {(e.access ?? []).length > 0 && <div className="access">{e.access.slice(0, 2).map((a) => <span className="tag acc" key={a}>♿ {a}</span>)}<span className="sub"> per Qloo</span></div>}
                      <div>{e.tags.slice(0, 4).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                      <button type="button" className="link noprint" onClick={() => reject(e.entity_id, e.name)}>Not for them</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}

          <div className="card">
            <h2>Conversation starters</h2>
            <ul className="plain">{plan.conversationStarters.map((c) => <li key={c}>{c}</li>)}</ul>
            <h2 style={{ marginTop: 18 }}>Tips for the day</h2>
            <ul className="plain">{plan.caregiverTips.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <details className="card noprint">
            <summary>How the agent got here ({plan.trace.length} Qloo calls)</summary>
            <ol className="trace">{plan.trace.map((t, i) => <li key={i}>{t.tool}: {t.summary}</li>)}</ol>
          </details>
        </section>
      )}

      {pending.length > 0 && !busy && (
        <div className="refresh noprint" role="status">
          <span>{pending.length} pick{pending.length > 1 ? "s" : ""} removed.</span>
          <button type="button" className="primary sm" onClick={() => run(rejected)}>Refresh plan without {pending.length > 1 ? "them" : "it"}</button>
          <button type="button" className="ghost sm light" onClick={undo}>Undo</button>
        </div>
      )}

      <p className="disc">Evergreen suggests tastes and comforts, not medical advice. Please check dietary needs and medication interactions with a doctor or dietitian.</p>
    </main>
  );
}
