# Hank

**A voice AI tutor that teaches house maintenance — like calling your dad when something breaks.**

Hank is a real-time voice agent who calmly walks homeowners through plumbing, electrical, drywall, and basic carpentry tasks one step at a time. He asks what tools you have before giving instructions, requires safety confirmation before touching electricity or water, remembers what you covered in past sessions, and knows when to refer you to a licensed pro. Built with LiveKit Agents, OpenAI's Realtime API, and Next.js.

## Demo

<img width="812" height="969" alt="Screenshot 2026-04-08 at 1 57 07 PM" src="https://github.com/user-attachments/assets/5b473f66-bd22-47fd-8890-3c569104dc52" />

<img width="819" height="967" alt="Screenshot 2026-04-08 at 1 58 40 PM" src="https://github.com/user-attachments/assets/d60a19e3-025b-4029-9ef5-a4d3995d4c4e" />

<img width="817" height="966" alt="Screenshot 2026-04-08 at 1 57 21 PM" src="https://github.com/user-attachments/assets/c90dc4d1-1cee-4f05-8788-af5287fbbbd1" />

<img width="818" height="968" alt="Screenshot 2026-04-08 at 1 59 14 PM" src="https://github.com/user-attachments/assets/574fff90-9a6e-4cd3-aea2-4b3821444f25" />

## Quick start

You'll need a LiveKit Cloud account (free tier works) and an OpenAI API key with Realtime API access (paid tier required).

### Option 1: Docker (recommended)

Requirements: Docker Desktop.

```bash
git clone https://github.com/horne-ra/hank.git
cd hank
cp .env.example .env  # then fill in your LiveKit and OpenAI keys
docker compose up --build
```

Open http://localhost:3000 and click "Start talking to Hank".

After you stop the stack with Ctrl+C, start it again with `docker compose up` (use `docker compose up --build` if you changed Dockerfiles). Do not run this at the same time as Option 2—they both use ports **3000** and **8000**.

### Option 2: Local development

For inspecting code or iterating quickly. Requirements: Python 3.11+, Node 20+, uv, pnpm.

```bash
git clone https://github.com/horne-ra/hank.git
cd hank
cp .env.example .env  # then fill in your LiveKit and OpenAI keys
./dev.sh
```

Open http://localhost:3000.

Stop with Ctrl+C (the script cleans up child processes); run `./dev.sh` again to restart. Use **Option 1** or **Option 2**, not both at once, or you will get port conflicts.

**Recommended:** use headphones. See **Hot mic and voice bleed** under Things I learned for why.

## Architecture overview

The app splits cleanly: the browser runs Next.js and talks to LiveKit for media; a small FastAPI service mints LiveKit JWTs and reads and writes session data in SQLite; a Python worker joins each room and runs the voice agent. Nothing in that chain depends on the others being in the same machine image except shared environment variables and the database file path the token server and worker both use.

```
┌──────────────┐  HTTPS   ┌──────────────────┐
│   Next.js    │─────────▶│  FastAPI Token   │
│   Frontend   │          │  Server (:8000)  │
│   (:3000)    │          └────────┬─────────┘
└──────┬───────┘                   │
       │                           │ SQLite
       │ WebRTC                    ▼
       ▼                    ┌──────────────┐
┌─────────────────────┐     │   hank.db    │
│  LiveKit Cloud SFU  │     └──────────────┘
└──────────┬──────────┘            ▲
           │ WebRTC                │
           ▼                       │
┌──────────────────────────────────┴─┐
│  Python Agent Worker                │
│  ├─ HankTutor (Agent + system prompt)│
│  ├─ OpenAI Realtime (voice loop)     │
│  ├─ Resume context (transcript inj.) │
│  └─ Shutdown hook → summary writer   │
└──────────────────────────────────────┘
```

Three layers matter in the code. **Voice and AI** live in `agent/tutor.py` and the `RealtimeModel` setup in `agent/worker.py`. `HankTutor` subclasses LiveKit's `Agent` with a domain-specific system prompt; the voice loop goes through OpenAI's Realtime API for sub-second turn-taking. **Session management** lives in `agent/session_store.py`: SQLite holds transcripts, summaries, resume links, and chip pre-seed text; after disconnect, `finalize_session` runs structured JSON output with `gpt-4.1-mini` to produce the summary the UI polls for. **The conversation entrypoint** is `agent/worker.py`: it builds `AgentSession`, registers the shutdown callback that persists the transcript and triggers summarization, loads resume context (full prior transcript when available, or summary-only instructions with anti-confabulation rules), and hands the room to the agent runtime. The FastAPI app in `token_server.py` is the HTTP face of that persistence layer for the frontend.

## Key design decisions

**OpenAI Realtime API instead of a chained STT–LLM–TTS pipeline.** One round trip is on the order of a few hundred milliseconds, one API surface, and interruption is handled inside the Realtime session. The tradeoff is less control over each stage and a higher per-minute bill than a stitched stack. For a short build where the product is "does it feel like a conversation," latency wins.

**LiveKit Cloud instead of self-hosting the SFU.** You avoid running TURN/STUN and tuning NAT yourself; the free tier is enough for a demo; edge POPs do more for audio RTT than anything you would ship in two hours. You take vendor coupling. For a take-home, that's an easy yes.

**Next.js App Router with API routes that proxy to Python.** `/api/token` and related routes forward to the FastAPI backend so the browser never needs the backend origin in client-side config beyond what you set server-side. You could run a separate Node server just for tokens; you don't have to.

**SQLite via SQLModel.** The prompt said SQLite was fine. One file under `backend/data/`, zero migration ceremony, easy to inspect with `sqlite3` when something looks wrong. Production would be Postgres with migrations and pooling; for a single-process demo, SQLite is the right shape.

**Persona and scope in the system prompt, not RAG.** Home repair guidance is already in the model's training data. A vector store would be machinery (embeddings, retrieval eval, another failure mode) for little gain on a two-hour timeline. The prompt in `prompts.py` is where pedagogy and boundaries live.

**The `/token` route stays unauthenticated at this layer.** A reviewer bot may flag it. The LiveKit JWT returned there is scoped to one room, short-lived, and is what authorizes media. Adding a shared secret in front of token minting mostly duplicates that without changing who can join the room if the secret leaks. In production this sits behind real user auth; for a single-tenant demo, the tradeoff is documented in `token_server.py` instead of papered over with fake security theater.

## Hank's pedagogy

> A chatbot answers questions. A tutor builds a relationship. The difference shows up in ten specific design choices Hank makes that a generic GPT wrapper wouldn't.

**Tool inventory before instructions.** Hank asks what you have on hand before he tells you what to do, so he does not assume channel-lock pliers when you're holding a butter knife. Voice makes this matter more than text: you're not typing a fantasy workshop; you're standing in the real room. That calibration is the main thing that separates "tutor" from "search result with a voice."

**Safety gating with confirmation.** For electrical, water, or gas he insists the system is off before continuing, and he does not let you negotiate him out of that. Gas and structural work get a hard stop and a referral. Teaching includes knowing when not to teach.

**One step at a time.** He does not dump a whole procedure. Each step waits for a human "done" or "okay" before the next. That is the difference between reading a wiki at someone and working with them.

**Adaptive language when you're stuck.** If you say you do not see the part, he rephrases in visual, plain language instead of repeating jargon. It reads like someone paying attention, because the prompt forces that behavior.

**Scope discipline.** Off-topic asks get a polite boundary; jobs that need a licensed pro get a referral, not a hack. He is not pulled into cooking, code, or homework by tone alone.

**Speech-shaped output.** No markdown, bullets, or emoji in the persona: the model is optimized for sentences that sound right through a speaker.

**Topic pre-seeding from chips.** Choosing "My toilet keeps running" on the welcome screen sends an `initial_message` through the token path; the first generated reply acknowledges that topic and asks something specific instead of a generic "what are we fixing" opener. Small cut in friction, clear signal that the UI was heard.

**Session continuity from real transcripts.** On resume, when the prior transcript exists, it is injected into the agent context so Hank continues like the same thread—not a paraphrase that invites invention.

**Anti-confabulation when context is thin.** If only a summary is available (no transcript), the worker adds explicit instructions: acknowledge past help in general terms, do not invent tools, steps, or quotes. That blocks the failure mode where vague memory becomes confident fabrication.

**English pinned at the transcription layer.** The Realtime stack occasionally opened in another language despite an English system prompt. The fix is `input_audio_transcription` with `language="en"` in `worker.py`, not more instructions in the prompt. Multimodal models can commit to a language in audio before your text rules fully apply—so you fix the transcription layer, not the prompt alone.

## Scaling to 10K concurrent sessions

Agent workers are stateless aside from the in-memory session they are serving. LiveKit's dispatch hands each room to an available worker; you scale by adding worker replicas behind the pool. The code here is one process; production is containers, health checks, and autoscaling on queue depth or connection count.

The token server is stateless HTTP. Put it behind a load balancer, scale on CPU. Each request is a JWT mint and a bit of SQLite—mostly you care about connection limits to the DB before you care about Python throughput.

The SFU is LiveKit Cloud's problem at the media layer. At very large concurrency, LiveKit's bill is worth modeling because media is where bits and money concentrate; the control-plane architecture does not change that economics.

The binding constraint for 10K concurrent Realtime sessions is usually **OpenAI rate limits and cost**, not your Python process count. Realtime is priced per audio minute at a level where "everyone talking at once" is a finance problem before it is a threading problem. Mitigations look like tenant-scoped API key pools, backpressure, and optionally swapping the `llm` on `AgentSession` for a cheaper STT–LLM–TTS path under load—the integration point is already a pluggable model object in `worker.py`.

SQLite does not survive that scale as a single file on one disk. You move to Postgres (or another operational store), partition by `user_id` or tenant when you add multi-tenancy, and move summary generation to a queue so disconnect does not hold a worker process for tens of seconds while `gpt-4.1-mini` finishes. Add request and session IDs to structured logs and ship them to something you can query when latency spikes.

## Things I learned

**Hot mic and voice bleed.** Realtime sometimes transcribed Hank's own audio coming back through the laptop speakers as user speech, so Hank answered himself and the session looked like ghost turns. Production fixes are better echo cancellation, tighter VAD, and treating speaker output as non-user by default. For the demo, headphones fixed it—which is why Quick start recommends them.

**Realtime language drift.** Early runs opened in Spanish or French with an English-only prompt. Setting `language="en"` on input transcription fixed it. The lesson: do not assume text instructions govern the audio stack the way they govern a text-only chat model.

**Where transcript state lives.** The history hook is `useTranscriptHistory` in `frontend/hooks/useTranscriptHistory.ts`, used from `SessionView`. Keeping it there (not inside a tab-only child) means switching between HANK and TRANSCRIPT does not unmount the hook and wipe history. Ephemeral UI state belongs on the ancestor that matches the lifecycle you care about.

**Security tools versus architecture.** An automated review wanted Bearer auth on `/token`. I tried it, then removed it: the LiveKit JWT is already the capability token for the room. The takeaway is to read automated advice, decide if it applies to your threat model, and either implement the real fix or document why you did not.

**Memory wants primary sources.** The first resume path injected a short summary into context. Hank then "remembered" things that never happened—once, greeting someone about presentation slides when they had only talked about plumbing. Switching to the actual prior transcript removed the hallucination. Summaries are for humans scanning a list; models doing continuation need the raw turns.

**Background work after the user has moved on.** Blocking the UI on a 20–30 second summary while the worker shut down felt broken. Ending the session returns you to the welcome flow, the past-sessions list shows the row with a generating state, and the summary appears when ready—same pattern as meeting bots that finish processing after you leave. Do not make people wait on AI work they have already mentally finished.

## Known limitations

There is no user authentication: anyone who can reach the deployment can start a session and see the same global session list. Tests are manual; time went into behavior, not pytest. The database is single-tenant SQLite under `backend/data/`, fine for a demo, wrong for multi-user production without a real store and isolation. Dropped WebRTC connections do not auto-reconnect—you reconnect yourself; auto-reconnect is a deep product decision, not a quick win. The UI is responsive but not a production mobile or PWA story. The welcome screen shows the five most recent past sessions (the API can return more); there is no full history or pagination yet—that belongs in "What I'd build next."

## What I'd build next

**Accounts and per-user session scope.** Today "memory" is global. Production needs sign-in and a `user_id` on every row, filtered queries, and probably separate LiveKit identity from anonymous demo mode.

**Hands-free mode.** The moment that matters is hands in a cabinet or under a sink. The demo is tap-first because that ships; the product wants a minimal chrome, large visualizer, and wake-word or always-listening UX so you are not cleaning grout off the phone.

**Pro handoff.** When Hank declines scope, the next step is not a dead end—it is a booked plumber or electrician. Integration with a marketplace or dispatch API turns liability into a product surface.

## Project structure

```
hank/
├── README.md
├── docker-compose.yml
├── dev.sh                     # local development launcher
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── token_server.py        # FastAPI: POST /token, GET /sessions, etc.
│   ├── data/                  # SQLite database (gitignored)
│   └── agent/
│       ├── worker.py          # LiveKit agent entrypoint with resume context
│       ├── tutor.py           # HankTutor Agent subclass
│       ├── prompts.py         # Hank persona + summary prompts
│       └── session_store.py   # SQLite, summary generation, resume queries
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx           # view router: welcome | active | session-detail
    │   ├── globals.css
    │   └── api/
    │       ├── token/route.ts
    │       ├── summary/route.ts
    │       └── sessions/
    │           ├── route.ts
    │           └── [id]/route.ts
    ├── hooks/
    │   └── useTranscriptHistory.ts
    └── components/
        ├── WelcomeScreen.tsx  # welcome + chips + past sessions list
        ├── TutorRoom.tsx      # wraps LiveKitRoom
        ├── SessionView.tsx    # active session UI + transcript hook
        ├── SessionDetail.tsx  # past session detail (ready + generating)
        ├── SummarySection.tsx
        ├── HankLogo.tsx
        ├── Visualizer.tsx
        └── Transcript.tsx
```
