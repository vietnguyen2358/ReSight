# ReSight — Voice Browser for the Visually Impaired

> Built for TreeHacks 2026

ReSight is an AI-powered voice browser that enables visually impaired users to navigate the entire internet using only their voice. It features a "Split Brain" architecture: a voice-first UI paired with headless browser automation orchestrated by a Council of AI Agents.

## Architecture

```
User Input → Orchestrator (LLM router)
               ├── Navigator (browser pilot) → Stagehand → Chromium
               ├── Scribe (memory store) → user_context.json
               └── Guardian (safety check) → approve/block

Parallel streams:
  Thoughts: Agent → SSE → ChatPanel (unified feed)
  Screenshots: Browser → memory cache → LiveFeed UI
```

**The Mind (Left Pane)** — Unified chat interface with real-time agent thought stream, inter-agent communication logs, and text/voice input. The ReSight sphere serves as a compact status indicator.

**The World (Right Pane)** — Live screenshot feed of the headless browser session with element overlay detection.

**The Council** — Four specialized AI agents working in two LLM layers:
- **Orchestrator** — Routes user intent to the right agent (LLM with 3 tools)
- **Navigator** — Plans & executes multi-step browser automation via Stagehand (LLM with 4 tools, up to 12 steps)
- **Scribe** — Manages user preferences and memory (no LLM, file I/O)
- **Guardian** — Safety analysis, dark-pattern detection, purchase confirmation (LLM, single call)

**Stagehand** — Browser automation layer using its own internal Gemini-2.0-flash LLM to translate natural language actions ("click the search box") into precise DOM interactions via Playwright.

## Setup

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   npx playwright install chromium
   ```

2. Configure environment variables in `.env.local`:
   ```
   GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
   NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 15** (App Router) + React 19
- **Tailwind CSS 4** + Framer Motion
- **ElevenLabs** — Voice conversation
- **Stagehand** — Browser automation
- **Vercel AI SDK** + Google Gemini — Agent orchestration
- **Three.js** + React Three Fiber — 3D visualization

## API Endpoints

- `POST /api/orchestrator` — Send a browser instruction
- `GET /api/thought-stream` — SSE stream of agent thoughts
- `GET /api/screenshot` — Latest browser screenshot (base64)

## Future Roadmap

- **Collaborative Browsing (Multiplayer Mode)** — Multiple users sharing and co-navigating a browser session in real-time
- **Persistent Memory** — Long-term user preference storage across sessions
- **Multi-tab Support** — Navigate multiple pages simultaneously
- **Accessibility Audit Agent** — Automatically detect and report accessibility issues on visited pages
