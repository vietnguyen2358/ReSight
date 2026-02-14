# CLAUDE.md — Gideon Codebase Guide

## Project Overview
Gideon is a voice-controlled web browser for the visually impaired, built for TreeHacks 2026. Next.js 15 App Router app with a "Split Brain" architecture: voice-first UI (left pane) + headless browser live feed (right pane), orchestrated by a Council of AI Agents.

## Tech Stack
- **Framework:** Next.js 15 (App Router) + React 19
- **LLM:** Google Gemini (`gemini-2.0-flash`) — powers both AI agents (via Vercel AI SDK) and Stagehand browser automation
- **Browser Automation:** Stagehand v3 (`@browserbasehq/stagehand`) — LOCAL mode for dev, BROWSERBASE optional
- **Voice:** ElevenLabs (`@elevenlabs/react`) — WebSocket-based conversational AI
- **Styling:** Tailwind CSS 4 (PostCSS plugin, no tailwind.config.js)
- **3D:** Three.js + React Three Fiber (wireframe icosahedron sphere)
- **Animation:** Framer Motion (thought stream entries)
- **AI SDK:** Vercel AI SDK v6 (`ai` package) + `@ai-sdk/google`

## Commands
```bash
npm install --legacy-peer-deps   # --legacy-peer-deps required (R3F peer dep conflict with React 19)
npm run dev                      # Start dev server on localhost:3000
npm run build                    # Production build (Next.js)
npx playwright install chromium  # Required once for Stagehand LOCAL mode
```

## Environment Variables (.env.local)
```
GOOGLE_GENERATIVE_AI_API_KEY=    # Single key for everything (agents + Stagehand)
NEXT_PUBLIC_ELEVENLABS_AGENT_ID= # ElevenLabs conversational agent
STAGEHAND_ENV=LOCAL              # LOCAL or BROWSERBASE
BROWSERBASE_API_KEY=             # Optional, only for BROWSERBASE mode
BROWSERBASE_PROJECT_ID=          # Optional, only for BROWSERBASE mode
```

## Architecture

### File Structure
```
app/
  layout.tsx              # Root layout, wraps children in GideonProvider
  page.tsx                # Renders SplitLayout (dynamically imported, no SSR)
  globals.css             # Tailwind 4 @import + @theme (black/yellow palette)
  api/
    orchestrator/route.ts # POST: receives {instruction}, runs agent orchestrator
    thought-stream/route.ts # GET: SSE stream of agent thoughts (EventSource)
    screenshot/route.ts   # GET: returns latest base64 screenshot + bounding boxes

components/
  SplitLayout.tsx         # 50/50 flex split: MindPane | WorldPane
  providers/
    GideonProvider.tsx    # React context: status, thoughts, screenshot, boundingBoxes
                          # Also subscribes to SSE thought-stream + polls /api/screenshot
  mind/
    MindPane.tsx          # Left pane: sphere + thought stream + speak button + VoiceManager
    GideonSphere.tsx      # Three.js Canvas, icosahedron wireframe, color/speed by status
                          # @ts-nocheck due to R3F v8 + React 19 type incompatibility
                          # Loaded via dynamic(() => import(...), { ssr: false })
    ThoughtStream.tsx     # AnimatePresence list of [Agent] message entries, auto-scrolls
    SpeakButton.tsx       # Toggle button, breathing/pulse CSS animations
  world/
    WorldPane.tsx         # Right pane: header + LiveFeed + scanlines overlay + status bar
    LiveFeed.tsx          # Renders base64 screenshot as <img>, overlay boxes on top
    OverlayBox.tsx        # Absolute-positioned neon green bounding box with label
  voice/
    VoiceManager.tsx      # Headless component: ElevenLabs useConversation hook
                          # clientTools.triggerBrowserAction calls POST /api/orchestrator
                          # Attaches click handler to #speak-button DOM element

lib/
  stagehand/
    session.ts            # Lazy singleton Stagehand (V3 class). Promise dedup prevents races.
                          # Uses gemini-2.0-flash with GOOGLE_GENERATIVE_AI_API_KEY
    screenshot.ts         # In-memory cache: setLatestScreenshot/getLatestScreenshot/captureScreenshot
  agents/
    types.ts              # ThoughtEvent, SendThoughtFn, AgentResult, NavigatorAction
    orchestrator.ts       # generateText with 3 tools: navigate, remember, safety_check
                          # Uses stopWhen: stepCountIs(5), inputSchema (AI SDK v6 API)
    navigator.ts          # Stagehand act/observe cycle. Detects URL commands, captures screenshots
                          # Page access: stagehand.context.activePage()
    scribe.ts             # Store/recall from user_context.json file
    guardian.ts           # LLM safety analysis, returns JSON {safe, reason, confirmationRequired}
  thought-stream/
    emitter.ts            # EventEmitter singleton, 100-entry history buffer, .sendThought() helper
  context/
    user-context.ts       # Read/write lib/context/user_context.json (file-based key-value store)
    user_context.json     # Persistent user preferences (starts as {})
```

### Data Flow
```
User Voice → ElevenLabs clientTool → POST /api/orchestrator
  → Orchestrator (Gemini generateText with tools)
    → Navigator (stagehand.act/observe) → screenshots + thoughts
    → Scribe (read/write user context)
    → Guardian (safety check)
  → Response JSON returned to ElevenLabs (spoken to user)
  → Thoughts broadcast via thoughtEmitter → SSE /api/thought-stream → ThoughtStream UI
  → Screenshots cached in memory → polled via /api/screenshot → LiveFeed UI
```

### GideonProvider State
- `status`: "idle" | "listening" | "thinking" | "speaking" — drives sphere color/speed
- `thoughts`: array of {id, agent, message, timestamp} — rendered in ThoughtStream
- `latestScreenshot`: base64 JPEG string — rendered in LiveFeed
- `boundingBoxes`: array of {x, y, width, height, label} — rendered as OverlayBox

## Key Patterns & Gotchas

### Stagehand v3 API (breaking changes from v1)
- Constructor takes `model: { modelName, apiKey }` not `modelName` + `modelClientOptions`
- `act(instruction)` and `observe(instruction)` take string directly (not objects)
- Page access: `stagehand.context.activePage()` not `stagehand.page`
- Export: `Stagehand` is actually the `V3` class re-exported

### AI SDK v6 (breaking changes from v4)
- `tool()` uses `inputSchema` not `parameters`
- `generateText` uses `stopWhen: stepCountIs(N)` not `maxSteps: N`
- `toolResults[].output` not `toolResults[].result`
- `maxOutputTokens` not `maxTokens`
- `stepCountIs` imported from "ai"

### React Three Fiber + React 19
- R3F v8 has peer dep `react >=18 <19` — install with `--legacy-peer-deps`
- JSX types (mesh, icosahedronGeometry) don't resolve — GideonSphere.tsx uses `@ts-nocheck`
- Must use `dynamic(() => import(...), { ssr: false })` — SSR crashes with ReactCurrentBatchConfig error

### next.config.ts
- `serverExternalPackages: ["@browserbasehq/stagehand", "playwright"]` is required or build fails

### Tailwind 4
- Uses `@tailwindcss/postcss` plugin in postcss.config.mjs (no tailwind.config.js)
- Custom colors defined via `@theme` block in globals.css (e.g., `--color-gideon-yellow: #ccff00`)
- Used as classes: `bg-gideon-black`, `text-gideon-yellow`, `border-gideon-green`, etc.
