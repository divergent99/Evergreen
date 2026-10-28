# Evergreen

A Qloo-powered agent that plans meals, music, screen time and outings for older adults (or the people who care for them) around what they genuinely love, adapted to how they eat and move today.

Built for the Qloo Agentic Hackathon.

## Why it needs Qloo

Generic assistants recommend "soft Italian food and some oldies". Evergreen starts from the person's own favourites, resolves them to Qloo entities and uses the taste graph for **cross-domain** inference: a love of Patsy Cline and *Casablanca* steers which restaurants, TV shows and outings fit, with release-year windows matched to their formative years. Every recommendation shown comes from a Qloo response (the server drops anything the model invents), and each card shows which of the person's favourites drove the match (Qloo `feature.explainability`).

## How it works

1. **Agent loop** (`lib/agent.ts`): Claude with tool use calls `search_entities`, `search_tags`, `get_insights`, then `submit_plan`.
2. **Qloo client** (`lib/qloo.ts`): `/search`, `/v2/tags`, `/v2/insights` on the hackathon base URL.
3. **Constraints**: everyday needs (soft food, low sodium, quiet venues...) become tag filters and exclusions, plus a plain-language care note per pick. Evergreen is not medical advice.
4. **UI** (`app/page.tsx`): one form, a plan with images, reasons, Qloo match chips and a visible trace of the agent's Qloo calls.

## Features

- Live agent progress streamed to the page as each Qloo call completes
- A gentle Monday-to-Sunday schedule built from the Qloo-grounded picks
- "Not for them" feedback: rejected picks are excluded from the plan and passed to Qloo as `filter.exclude.entities` on refresh
- Larger-text mode, keyboard-friendly controls, print layout, copy-as-text, remembered profile
- Per-IP hourly rate limit (`RATE_LIMIT_PER_HOUR`, default 12)
- `DEMO_MODE=1` returns a sample plan for UI work; never set it in production

## Run locally

```bash
npm install
cp .env.example .env.local   # add QLOO_API_KEY and ANTHROPIC_API_KEY
npm run dev
```

Qloo hackathon keys only work with `https://hackathon.api.qloo.com`. Request one at https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide.

## Deploy (Railway)

1. New Project, Deploy from GitHub repo, pick this repo. Railway detects Next.js and runs `npm run build` then `npm start`.
2. Add variables: `QLOO_API_KEY`, `QLOO_BASE_URL=https://hackathon.api.qloo.com`, `ANTHROPIC_API_KEY`. Do not set `DEMO_MODE`.
3. Settings, Networking, Generate Domain.

A plan takes about a minute (14-17 Qloo calls), so use a host without a short request timeout. The app streams progress while it works.

## License

MIT
