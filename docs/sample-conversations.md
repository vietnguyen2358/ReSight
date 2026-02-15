# ReSight Sample Flows & Playbook

The **playbook** (`lib/agents/playbook.ts`) contains condensed reference flows that the Navigator uses as few-shot context. When a user instruction matches keywords, `findSimilarFlow()` injects the relevant reference into the Navigator prompt to guide approach and tone.

This doc summarizes those flows and the patterns they teach.

---

## How It Works

1. User speaks or types an instruction.
2. `findSimilarFlow(instruction)` scores the instruction against playbook keywords.
3. If a flow matches (score ≥ 1.5), its `reference` string is appended to the Navigator prompt:
   ```
   REFERENCE — A similar task was handled before. Use this as a guide for approach and tone:
   Task: "..."
   [condensed flow]
   ```
4. The Navigator uses this to produce the right steps (goto_url, do_action, extract_info, narrate) and conversational tone.

---

## Playbook Flows (by Category)

### Navigator-Only Flows

| Flow | User Instruction | Key Pattern |
|------|------------------|-------------|
| **Coffee / Trip Planning** | "Find 3 coffee shops near X, compare rating + distance, open best one and read hours" | Google search → extract & compare → open best → narrate hours |
| **Restaurant Decision** | "Find top ramen in SF under $$, which is open now with best rating" | Search + open now + rating filter → compare → recommend |
| **Event Discovery** | "Find a free tech event this week in San Jose, summarize date/location/signup" | Google → Eventbrite → extract event details → narrate |
| **DMV / Government** | "Find DMV appointment for San Jose, walk me to booking page" | Search → open official site → click through to form → ask_user if multi-step |
| **Product Research** | "Find 2 whey protein options, compare price per ounce, recommend one" | Amazon search → extract specs + price → compare → recommend |
| **Transit Directions** | "Get transit directions from A to B, summarize transfers and time" | Google Maps transit → extract route → narrate transfers |
| **News Digest** | "Find latest on X, compare 3 sources, summarize differences" | Open Reuters, TechCrunch, AP (or similar) → extract key points → compare framing |
| **Form Assistance** | "Open SJSU scholarship app, list required fields, what do I need ready" | Find form → extract fields → narrate checklist |
| **Multi-Turn Research** | "What is TreeHacks 2026? Sponsors? Prize tracks? Where is it?" | Each turn: search or scroll → extract → narrate → offer follow-up |

### Multi-Agent Flows

| Flow | Agents | Key Pattern |
|------|--------|-------------|
| **Sketchy Link (Guardian)** | Orchestrator → Guardian | Shortened URL + "free/prize" → safety_check → BLOCK → explain in plain language |
| **Scribe Memory** | Scribe → Navigator | Turn 1: remember(store). Turn 2: recall → pass to Navigator for personalized search |
| **Shopping + Scam Check** | Scribe, Navigator, Guardian | Search → narrate options → user picks suspicious deal → Guardian blocks → recommend legit option |
| **Dark Pattern at Checkout** | Navigator → Guardian | Checkout has pre-checked subscription / hidden fee → Guardian blocks → offer to uncheck |

---

## Narrator Tone (What the Playbook Teaches)

- **Specific facts** — names, prices, ratings, times, addresses. Never vague "I found several options."
- **Friend-next-to-you** — "Okay so...", "Alright...", "Nice...". Not "Based on my analysis..."
- **End with follow-up** — "Want me to get directions?" / "Should I open the signup page?"
- **Milestones only** — 1–2 rich updates per task, not play-by-play of every click.
- **Guardian explains plainly** — "The price is way below retail and the site has no secure connection" not "This action has been flagged."

---

## Conversation Patterns

1. **Clarification feels natural** — "Which one do you need?" not "Please select from the following."
2. **Multi-turn maintains context** — User says "yeah, sponsors?" and Navigator knows they mean TreeHacks.
3. **Scribe personalizes silently** — User says allergies once; every future search is peanut-aware.
4. **Agent names stay internal** — User never hears "The Guardian agent has analyzed...". They hear natural conversation.
