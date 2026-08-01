## AMACOS - Autonomous Multi-Agent Campus Operating System

AMACOS is a six-agent pipeline that takes a raw campus complaint (text, image, or
video submission) and turns it into a classified, prioritized, assigned, and
SLA-tracked ticket, with a real-time dashboard and automatic escalation if
nothing happens in time.

Built during Agentathon 2025 (GDG Hyderabad) against a running clock of 36 hours.
Still proves that a campus can be run by a central intelligence layer instead of disconnected,
manually-operated tools.

## Architecture

```
POST /process_complaint
        │
        ▼
 ingestAgent      → sanitizes input, builds a structured Task (server-generated ID)
        │
        ▼
 classifyAgent    → category + severity (real Gemini reasoning if GEMINI_API_KEY
        │            is set; honest keyword-based fallback otherwise)
        ▼
 decisionAgent    → validation, spam/duplicate rejection, priority, SLA deadline
        │
        ▼
 executorAgent    → ticket ID, action log, (simulated) notification dispatch
        │
        ▼
 monitorAgent     → starts SLA tracking; a background sweep every 30s escalates
        │            anything that blows its deadline (see MVP Scenario 2 below)
        ▼
 routingAgent     → assigns a department, with fallback routing if that
        │            department already has too many open High-priority tickets
        ▼
   Dashboard (socket.io real-time feed) + persisted to data/problems.json
```

## Running it

```bash
npm install
npm start
```

- Landing page: `http://localhost:5000/landing/ld_index.html`
- Report an issue: `http://localhost:5000/problem/pb_index.html`
- Dashboard: `http://localhost:5000/dashboard/db_index.html`

The task list starts empty. To load 3 sample tickets for a demo:
`curl -X POST http://localhost:5000/seed`

### Enabling real AI classification

By default, `classifyAgent` uses a keyword-based heuristic and labels every
task with `classificationMethod: "heuristic"` so it's honest about what ran.
To switch on real model reasoning:

```bash
export GEMINI_API_KEY="your-key-here"   # free tier at https://aistudio.google.com/apikey
npm start
```

Tasks classified this way are labeled `classificationMethod: "gemini"`.

## What's real vs. simulated

Per the project brief's own reality check:

| Component | Status |
|---|---|
| Agent orchestration (6-agent pipeline) | Real |
| Backend (Express + Socket.io, validation, persistence) | Real |
| AI reasoning for classification | Real, when `GEMINI_API_KEY` is set. Falls back to a labeled heuristic otherwise. |
| SLA tracking + escalation (MVP Scenario 2) | Real — a 30-second sweep checks every open task against its priority-based SLA deadline and escalates overdue ones live to the dashboard. |
| CCTV / external system integration | Simulated (as scoped) |
| SMS / email notifications | Simulated — logged to the task's action log, not actually sent |
| Image/video "analysis" | **Not implemented.** The form accepts image/video files and previews them client-side, but the file itself is never uploaded to or processed by the backend — only the filename is sent as text. Treat image/video mode as a UI mockup for now, not a working feature. |

## Security notes (fixed in this pass)

- **Stored XSS in the dashboard** — complaint content was previously inserted with
  `innerHTML`, so a submission like `<img src=x onerror=...>` would execute in
  any admin's browser viewing the dashboard. Now rendered via `textContent` only.
- **Submissions always reported "success" in the UI**, even when the backend
  rejected them or the request failed outright. Fixed — real failures now show
  a real error state.
- **All input was trusted from the client** — including a client-generated task
  ID and status field. The server now generates IDs itself and only accepts
  `name`, `roll`, `type`, `content`; the format of each is validated server-side.
- **No rate limiting / duplicate detection** — added a 10-requests/minute limiter
  and a 1-minute duplicate-submission fingerprint check.
- **CORS was wide open (`origin: "*"`)** — now an explicit allow-list, configurable
  via `ALLOWED_ORIGINS`.
- **Spam filter only caught single repeated characters** (`"aaaaa"`) — now also
  catches low-diversity and repeated-pattern spam (`"asdasdasdasd"`).
- **In-memory data store wiped on every restart** — now persisted to
  `data/problems.json`.

## Known gaps (being upfront about what's left)

- **No authentication on the dashboard or `/problems` endpoint.** Anyone with
  the URL can view all submitted reports, including names and roll numbers.
  Fine for a hackathon demo on a private network; not fine for real deployment.
- **Image/video files aren't actually processed** — see table above.
- **Duplicate-detection and rate-limiting are in-memory and per-process** — they
  reset on restart and won't work correctly if AMACOS is ever run behind a
  load balancer with multiple instances. A real deployment needs Redis or
  equivalent shared state.
- **Persistence is a flat JSON file**, fine at prototype scale, not a substitute
  for a real database under concurrent write load.
- **No verification that a "roll number" actually belongs to the person typing
  it** — there's no login/SSO integration, so identity is self-reported.
  Format validation stops obvious garbage but doesn't stop someone typing
  someone else's real roll number.

## Tech stack
- Node.js, Express, Socket.io
- Vanilla JS/HTML/CSS frontend (no framework)
- Gemini API (optional, for real classification reasoning)
