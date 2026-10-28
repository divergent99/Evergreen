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

const SUGGESTIONS = ["Frank Sinatra", "The Beatles", "Patsy Cline", "Casablanca", "I Love Lucy", "The Andy Griffith Show", "Italian food", "Tex-Mex", "Jazz", "Gardening", "Elvis Presley", "Chinese food"];

/** Turn raw tool-call traces into plain language. */
function friendly(s: Step) {
  const m = s.summary.match(/^“(.+?)” → (.+)$/);
  if (s.tool === "Qloo search" && m) return m[2] === "no match" ? `Couldn't find “${m[1]}”, moving on` : `Found ${m[2]} in Qloo's taste graph`;
  if (s.tool === "Qloo tags" && m) return `Checking what “${m[1]}” means for the plan`;
  if (s.tool === "Qloo insights") {
    const k = s.summary.match(/^(\w+): (\d+) taste-matched results(?: from (\d+) favourites)?/);
    if (k) {
      const noun: Record<string, string> = { place: "places", artist: "artists", movie: "films", tv_show: "TV shows", book: "books", podcast: "podcasts", brand: "brands", destination: "destinations" };
      return `Found ${k[2]} ${noun[k[1]] ?? k[1]} that fit their taste${k[3] ? `, based on ${k[3]} of their favourites` : ""}`;
    }
  }
  return s.summary;
}

const SECTION_LABEL: Record<string, string> = { dining: "Dining", music: "Music", screen: "Shows & films", outing: "Outings", reading: "Reading" };
const BLANK = { name: "", birthYear: "", city: "", loves: "", notes: "", relationship: "myself", needs: [] as string[] };
type Rejected = { id: string; name: string };
const WHEN_ORDER = ["Morning", "Lunch", "Afternoon", "Evening"];

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* ---------- tiny inline icons ---------- */
const I = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS: Record<string, string> = {
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.5 2 8 0 5.5-4.8 10-10 10Z M2 21c0-3 1.9-5.4 5.1-6.1C9.6 14.4 12 13 13 12",
  dining: "M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2 M6 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  music: "M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  screen: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z M10 9l5 3-5 3Z",
  outing: "M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  reading: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z",
  check: "M20 6 9 17l-5-5",
  arrow: "M5 12h14 M12 5l7 7-7 7",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  heart: "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.7 0-3 .8-4.5 2.5C10.5 3.8 9.2 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.300 1.500 4 3 5.500l7 7Z",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  x: "M18 6 6 18 M6 6l12 12",
  print: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6Z",
  copy: "M8 8h12v12H8Z M4 16V4h12",
  access: "M12 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M10 8v6h5l2 5 M10 11h5 M7 12a5 5 0 1 0 8 5",
};
const Ic = ({ n, size }: { n: keyof typeof ICONS; size?: number }) => <I d={ICONS[n]} size={size} />;

export default function Home() {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [pending, setPending] = useState<Rejected[]>([]);
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);
  const planRef = useRef<HTMLElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = store.get("evergreen.profile");
    if (saved) { try { setF({ ...BLANK, ...JSON.parse(saved) }); } catch { /* ignore */ } }
    setBig(store.get("evergreen.big") === "1");
  }, []);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (n: string) => setF((s) => ({ ...s, needs: s.needs.includes(n) ? s.needs.filter((x) => x !== n) : [...s.needs, n] }));
  const toggleBig = () => { setBig((b) => { store.set("evergreen.big", b ? "0" : "1"); return !b; }); };

  async function run(rej: Rejected[], profile = f) {
    setBusy(true); setErr(""); setSteps([]); setPending([]);
    setTimeout(() => liveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    store.set("evergreen.profile", JSON.stringify(profile));
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, rejected: rej }) });
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
  const tryExample = () => { setF(EXAMPLE); setRejected([]); setPlan(null); run([], EXAMPLE); };
  const addLove = (x: string) => set("loves", f.loves.trim() ? `${f.loves.trim().replace(/,$/, "")}, ${x}` : x);
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
  const pct = Math.min(95, Math.round((steps.length / 15) * 100));

  return (
    <div className={big ? "app big" : "app"}>
      <header className="nav noprint">
        <div className="nav-in">
          <a href="#top" className="logo"><span className="logo-mark"><Ic n="leaf" size={18} /></span>Evergreen</a>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#form">Plan a week</a>
            <button type="button" className="pill-btn" aria-pressed={big} onClick={toggleBig}>{big ? "Normal text" : "Larger text"}</button>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ---------- hero ---------- */}
        <section className="hero noprint">
          <div className="hero-in">
            <div className="hero-copy">
              <span className="eyebrow"><Ic n="spark" size={14} />Powered by Qloo&rsquo;s taste graph</span>
              <h1>Care that knows <em>what they love.</em></h1>
              <p className="lede">Tell us a few favourites. Evergreen plans a gentle week of meals, music, shows and outings that feel like <b>them</b>, adapted to how they eat and move today.</p>
              <div className="cta-row">
                <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={tryExample}>See an example plan <Ic n="arrow" size={18} /></button>
                <a className="btn btn-ghost btn-lg" href="#form">Plan for someone you know</a>
              </div>
              <ul className="trust">
                <li><Ic n="pin" size={18} />Real places near them</li>
                <li><Ic n="heart" size={18} />Matched to their taste</li>
                <li><Ic n="check" size={18} />Every pick explained</li>
              </ul>
            </div>

            <div className="hero-art" aria-hidden="true">
              <div className="mock">
                <div className="mock-head"><span>Margaret&rsquo;s week</span><small>Illustrative</small></div>
                <div className="mock-row"><span className="mock-day">Mon</span><span className="dot dining" /><div><b>Quiet Italian lunch</b><small>Soft pasta, light on salt</small></div></div>
                <div className="mock-row"><span className="mock-day">Tue</span><span className="dot music" /><div><b>Patsy Cline on the record player</b><small>Afternoon, volume low</small></div></div>
                <div className="mock-row"><span className="mock-day">Wed</span><span className="dot screen" /><div><b>Casablanca night</b><small>Evening, subtitles on</small></div></div>
              </div>
              <div className="float float-1"><Ic n="spark" size={14} />Matched to Patsy Cline &amp; Casablanca</div>
              <div className="float float-2"><Ic n="access" size={14} />Wheelchair accessible entrance · per Qloo</div>
              <div className="blob blob-1" /><div className="blob blob-2" />
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="how noprint" id="how">
          <div className="wrap">
            <h2 className="sec-title">How Evergreen works</h2>
            <div className="how-grid">
              <div className="how-card"><span className="num">1</span><h3>Tell us about them</h3><p>Their favourite music, films, foods and places, plus everyday needs like soft food or step-free access.</p></div>
              <div className="how-card"><span className="num">2</span><h3>Qloo finds what fits</h3><p>Our agent asks Qloo&rsquo;s taste graph, so music and film taste can shape the restaurants and outings.</p></div>
              <div className="how-card"><span className="num">3</span><h3>You get a gentle week</h3><p>A realistic schedule with a care note on every pick and a reason it suits them. Nothing invented.</p></div>
            </div>
          </div>
        </section>

        {/* ---------- form ---------- */}
        <section className="wrap form-wrap noprint" id="form">
          <form className="panel" onSubmit={submit}>
            <div className="panel-head">
              <h2>Plan their week</h2>
              <p>Takes a minute to fill in. Everything is saved in your browser, nowhere else.</p>
            </div>

            <fieldset>
              <legend><span className="step">1</span>About them</legend>
              <div className="grid3">
                <div><label htmlFor="n">First name</label><input id="n" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Margaret" autoComplete="off" /></div>
                <div><label htmlFor="b">Year born</label><input id="b" inputMode="numeric" value={f.birthYear} onChange={(e) => set("birthYear", e.target.value)} placeholder="1948" required /></div>
                <div><label htmlFor="c">City</label><input id="c" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Austin, Texas" /></div>
              </div>
              <label htmlFor="r">I&rsquo;m planning this for</label>
              <div className="seg" role="radiogroup" aria-label="Planning for">
                <button type="button" role="radio" aria-checked={f.relationship === "myself"} className={f.relationship === "myself" ? "on" : ""} onClick={() => set("relationship", "myself")}>Myself</button>
                <button type="button" role="radio" aria-checked={f.relationship === "caregiver"} className={f.relationship === "caregiver" ? "on" : ""} onClick={() => set("relationship", "caregiver")}>Someone I care for</button>
              </div>
            </fieldset>

            <fieldset>
              <legend><span className="step">2</span>What they love</legend>
              <label htmlFor="l">Music, films, shows, foods, places <span className="hint">Names work best</span></label>
              <textarea id="l" value={f.loves} onChange={(e) => set("loves", e.target.value)} placeholder="Patsy Cline, Casablanca, Italian food…" required />
              <div className="sugs" aria-label="Quick add ideas">
                <span className="hint">Not sure? Tap to add</span>
                {SUGGESTIONS.filter((x) => !f.loves.toLowerCase().includes(x.toLowerCase())).slice(0, 8).map((x) => (
                  <button type="button" key={x} className="chip dashed" onClick={() => addLove(x)}>+ {x}</button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend><span className="step">3</span>Everyday needs <span className="hint">Optional</span></legend>
              <div className="chips" role="group" aria-label="Everyday needs">
                {NEEDS.map((n) => (
                  <button type="button" key={n} aria-pressed={f.needs.includes(n)} className={`chip ${f.needs.includes(n) ? "on" : ""}`} onClick={() => toggle(n)}>
                    {f.needs.includes(n) && <Ic n="check" size={15} />}{n}
                  </button>
                ))}
              </div>
              <label htmlFor="o">Anything else we should know?</label>
              <input id="o" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Enjoys long lunches, dislikes loud rooms…" />
            </fieldset>

            <div className="submit-row">
              <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? <><span className="spin" />Planning…</> : <>Plan their week <Ic n="arrow" size={18} /></>}</button>
              <button type="button" className="btn btn-ghost btn-lg" disabled={busy} onClick={() => setF(EXAMPLE)}>Fill in an example</button>
            </div>
            {err && <div className="err" role="alert">{err} <button type="button" className="link" onClick={() => run(rejected)}>Try again</button></div>}
          </form>
        </section>

        {/* ---------- progress ---------- */}
        {busy && (
          <section className="wrap noprint">
            <div ref={liveRef} className="panel live" aria-live="polite">
              <h2>Building {f.name ? `${f.name}’s` : "their"} week</h2>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.max(6, pct)}%` }} /></div>
              <p className="muted">This takes about a minute. We&rsquo;re asking Qloo, not guessing.</p>
              <ul className="steps">
                {steps.slice(-6).map((s, i) => <li key={steps.length - Math.min(6, steps.length) + i}><span className="tick"><Ic n="check" size={14} /></span>{friendly(s)}</li>)}
                <li className="now"><span className="spin dark" />Thinking about what fits…</li>
              </ul>
            </div>
          </section>
        )}

        {/* ---------- results ---------- */}
        {plan && (
          <section ref={planRef} className="results">
            <div className="wrap">
              <nav className="jump noprint" aria-label="Jump to section">
                {plan.week.length > 0 && <a href="#week">Week</a>}
                {sections.map((s) => <a key={s.title} href={`#sec-${s.kind}-${s.title.length}`}>{SECTION_LABEL[s.kind] ?? s.title}</a>)}
                <a href="#form">Edit details</a>
              </nav>

              <div className="banner">
                <div>
                  <span className="eyebrow light"><Ic n="spark" size={14} />Your plan</span>
                  <p className="banner-text">{plan.greeting}</p>
                </div>
                <div className="banner-actions noprint">
                  <button type="button" className="btn btn-light" onClick={() => window.print()}><Ic n="print" size={16} />Print</button>
                  <button type="button" className="btn btn-light" onClick={copy}><Ic n="copy" size={16} />{copied ? "Copied" : "Copy as text"}</button>
                </div>
              </div>

              {plan.week.length > 0 && (
                <div className="block" id="week">
                  <h2 className="block-title"><span className="kind-ic week"><Ic n="outing" size={20} /></span>Their week</h2>
                  <div className="week">
                    {plan.week.map((d) => {
                      const slots = d.slots.filter((s) => !hidden.has(s.entity.entity_id)).sort((a, b) => WHEN_ORDER.indexOf(a.when) - WHEN_ORDER.indexOf(b.when));
                      return (
                        <div className="day" key={d.day}>
                          <h3>{d.day}</h3>
                          {slots.length ? slots.map((s, i) => (
                            <div className="slot" key={i}><span className="when">{s.when}</span>{s.activity}</div>
                          )) : <div className="muted">A restful day.</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sections.map((s) => (
                <div className="block" key={s.title} id={`sec-${s.kind}-${s.title.length}`}>
                  <h2 className="block-title"><span className={`kind-ic ${s.kind}`}><Ic n={(s.kind in ICONS ? s.kind : "spark") as keyof typeof ICONS} size={20} /></span>{s.title}</h2>
                  <p className="muted block-intro">{s.intro}</p>
                  <div className="cards">
                    {s.items.map(({ entity: e, note, careNote }) => (
                      <article className={`card k-${s.kind}`} key={e.entity_id}>
                        {e.image ? <img src={e.image} alt="" loading="lazy" /> : <div className="ph" />}
                        <div className="card-body">
                          <h3>{e.name}</h3>
                          {e.address && (
                            <div className="addr"><Ic n="pin" size={14} />{e.address}
                              <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.name} ${e.address}`)}`}>Directions</a>
                            </div>
                          )}
                          <p className="note">{note}</p>
                          {careNote && <div className="care"><b>Good to know</b>{careNote}</div>}
                          {(e.access ?? []).length > 0 && <div className="tags">{e.access.slice(0, 2).map((a) => <span className="tag acc" key={a}><Ic n="access" size={13} />{a}</span>)}<small className="muted"> per Qloo</small></div>}
                          {e.because.length > 0 && <div className="why"><Ic n="spark" size={14} />Matched to {e.because.map((b) => b.name).join(", ")}</div>}
                          <div className="tags">{e.tags.slice(0, 4).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                          <button type="button" className="link noprint" onClick={() => reject(e.entity_id, e.name)}><Ic n="x" size={14} />Not for them</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}

              {(plan.conversationStarters.length > 0 || plan.caregiverTips.length > 0) && (
                <div className="block two">
                  {plan.conversationStarters.length > 0 && <div className="soft-card"><h3>Conversation starters</h3><ul>{plan.conversationStarters.map((c) => <li key={c}>{c}</li>)}</ul></div>}
                  {plan.caregiverTips.length > 0 && <div className="soft-card warm"><h3>Tips for the day</h3><ul>{plan.caregiverTips.map((c) => <li key={c}>{c}</li>)}</ul></div>}
                </div>
              )}

              <details className="trace-box noprint">
                <summary>How the agent got here ({plan.trace.length} Qloo calls)</summary>
                <ol className="trace">{plan.trace.map((t, i) => <li key={i}>{t.tool}: {t.summary}</li>)}</ol>
              </details>
            </div>
          </section>
        )}

        {pending.length > 0 && !busy && (
          <div className="refresh noprint" role="status">
            <span>{pending.length} pick{pending.length > 1 ? "s" : ""} removed</span>
            <button type="button" className="btn btn-accent" onClick={() => run(rejected)}>Refresh plan without {pending.length > 1 ? "them" : "it"}</button>
            <button type="button" className="btn btn-ghost-light" onClick={undo}>Undo</button>
          </div>
        )}
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>Evergreen suggests tastes and comforts, not medical advice. Please check dietary needs and medication interactions with a doctor or dietitian.</p>
          <p className="foot-sub">Built for the Qloo Agentic Hackathon · Accessibility details are from Qloo&rsquo;s data, so call ahead to confirm.</p>
        </div>
      </footer>
    </div>
  );
}
