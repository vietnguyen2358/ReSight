# CLAUDE.md — ReSite Codebase Guide

## Project Overview
ReSite is a voice-controlled web browser for the visually impaired, built for TreeHacks 2026. Next.js 15 App Router app with a "Split Brain" architecture: voice-first UI (left pane) + headless browser live feed (right pane), orchestrated by a Council of AI Agents.

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
GOOGLE_GENERATIVE_AI_API_KEY=    # Required for Stagehand; also used for agents if no OpenRouter
OPENROUTER_API_KEY=              # Optional: use OpenRouter for agent LLM calls
OPENROUTER_MODEL=                # Optional: model name (default: openai/gpt-4o-mini)
NEXT_PUBLIC_ELEVENLABS_AGENT_ID= # ElevenLabs conversational agent
STAGEHAND_ENV=LOCAL              # LOCAL or BROWSERBASE
BROWSERBASE_API_KEY=             # Required for BROWSERBASE mode
BROWSERBASE_PROJECT_ID=          # Required for BROWSERBASE mode
```

## Architecture

### File Structure
```
app/
  layout.tsx              # Root layout, wraps children in provider context
  page.tsx                # Renders SplitLayout (dynamically imported, no SSR)
  globals.css             # Tailwind 4 @import + @theme (black/yellow palette)
  api/
    orchestrator/route.ts # POST: receives {instruction}, runs agent orchestrator
    thought-stream/route.ts # GET: SSE stream of agent thoughts (EventSource)
    screenshot/route.ts   # GET: returns latest base64 screenshot + bounding boxes
    dev-logs/route.ts     # GET: poll logs (?since=ID), DELETE: clear logs
    clarification/route.ts # GET: poll pending question, POST: submit answer

components/
  SplitLayout.tsx         # 50/50 flex split: MindPane | WorldPane
  providers/
    GideonProvider.tsx    # React context: status, thoughts, screenshot, boundingBoxes
                          # Also subscribes to SSE thought-stream + polls /api/screenshot
  mind/
    MindPane.tsx          # Left pane: sphere + chat panel + speak button + VoiceManager
    ChatPanel.tsx         # Unified chat: user messages + narrator thoughts + clarification Q&A
                          # Supports interrupts (stop/cancel/go back) during loading
                          # Polls /api/clarification for pending questions
    GideonSphere.tsx      # Three.js Canvas, icosahedron wireframe, color/speed by status
                          # @ts-nocheck due to R3F v8 + React 19 type incompatibility
                          # Loaded via dynamic(() => import(...), { ssr: false })
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
    session.ts            # Lazy singleton Stagehand (globalThis). Promise dedup prevents races.
                          # Uses gemini-2.0-flash with GOOGLE_GENERATIVE_AI_API_KEY
                          # BROWSERBASE mode: solveCaptchas + proxies enabled
    screenshot.ts         # In-memory cache: setLatestScreenshot/getLatestScreenshot/captureScreenshot
  agents/
    types.ts              # ThoughtEvent, SendThoughtFn, AgentResult, NavigatorAction
    orchestrator.ts       # generateText with 3 tools: navigate, remember, safety_check
                          # Handles stop/cancel/go-back commands + clarification routing
    navigator.ts          # 6 tools: goto_url, do_action, extract_info, narrate, ask_user, done
                          # Conversational narration for blind users ("Narrator" agent)
                          # AbortController force-stop loop detection (kills generateText)
                          # Bot block detection with Google search fallback
                          # Enhanced getPageContext: headings, buttons, forms, signals
    scribe.ts             # Store/recall from user_context.json file
    guardian.ts           # LLM safety analysis, returns JSON {safe, reason, confirmationRequired}
    cancellation.ts       # globalThis abort flag: requestAbort/clearAbort/isAborted/setLastUrl
    clarification.ts      # Promise bridge for ask_user: askQuestion blocks, answerQuestion resolves
  thought-stream/
    emitter.ts            # EventEmitter singleton (globalThis), 100-entry history, .sendThought()
  dev-logger.ts           # DevLogger singleton (globalThis), in-memory log buffer for /dev page
  context/
    user-context.ts       # Read/write lib/context/user_context.json (file-based key-value store)
    user_context.json     # Persistent user preferences (starts as {})
```

### Data Flow
```
User Voice/Text → POST /api/orchestrator
  → Orchestrator checks: pending question? stop command? go back?
  → Orchestrator (Gemini generateText with tools)
    → Navigator (6 tools, narrates to user via "Narrator" thoughts)
      → Stagehand act/observe/extract → screenshots + thoughts
      → Bot block detection → Google search fallback
      → Loop detection → AbortController force-stop
    → Scribe (read/write user context)
    → Guardian (safety check)
  → Response returned to voice (ElevenLabs) or chat (ChatPanel)
  → Thoughts broadcast via thoughtEmitter → SSE /api/thought-stream → ChatPanel
  → Screenshots cached in memory → polled via /api/screenshot → LiveFeed UI
```

### Provider State
- `status`: "idle" | "listening" | "thinking" | "speaking" — drives sphere color/speed
- `thoughts`: array of {id, agent, message, timestamp} — rendered in ChatPanel
- `latestScreenshot`: base64 JPEG string — rendered in LiveFeed
- `boundingBoxes`: array of {x, y, width, height, label} — rendered as OverlayBox

### Key Agent Patterns
- **Narrator thoughts**: agent="Narrator" gets prominent styling in ChatPanel (large white text, green bar)
- **Clarification flow**: Navigator calls ask_user → blocks on promise → ChatPanel polls /api/clarification → user answers → promise resolves
- **Interrupts**: "stop"/"cancel"/"go back" bypass loading state, route to orchestrator immediately
- **Loop detection**: AbortController kills generateText at code level (not reliant on LLM obedience)
- **Bot blocks**: detectBotBlock() checks page content, returns Google search suggestion to LLM
- **globalThis singletons**: Stagehand, ThoughtEmitter, DevLogger all use globalThis to survive Next.js hot reloads

## Key Patterns & Gotchas

### Stagehand v3 API (breaking changes from v1)
- Constructor takes `model: { modelName, apiKey }` not `modelName` + `modelClientOptions`
- `act(instruction)` and `observe(instruction)` take string directly (not objects)
- Page access: `stagehand.context.activePage()` not `stagehand.page`
- Export: `Stagehand` is actually the `V3` class re-exported
- `page.goto()` and `page.goBack()` use `timeoutMs` not `timeout`
- BROWSERBASE mode: `browserbaseSessionCreateParams` for `solveCaptchas`, `proxies`
- `advancedStealth` requires Scale plan (not available on free tier)

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
- Custom colors defined via `@theme` block in globals.css (e.g., `--color-resite-yellow: #ccff00`)
- Used as classes: `bg-resite-black`, `text-resite-yellow`, `border-resite-green`, etc.
