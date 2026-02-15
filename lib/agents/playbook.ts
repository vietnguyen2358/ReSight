/**
 * Playbook — sample conversation flows the navigator uses as few-shot context.
 * Before each task, findSimilarFlow() matches the instruction to the most
 * relevant flow and returns a condensed reference conversation showing the
 * ideal approach, agent coordination, and conversational tone.
 */

export interface PlaybookFlow {
  id: string;
  title: string;
  keywords: string[];
  userInstruction: string;
  /** Condensed reference showing ideal approach + tone (injected into navigator prompt) */
  reference: string;
  /** Which agents are involved — for demo/logging purposes */
  agents: string[];
}

const FLOWS: PlaybookFlow[] = [
  // ── Single-agent flows (Navigator-focused) ──
  {
    id: "coffee-trip",
    title: "Trip Planning — Coffee Shops",
    keywords: ["coffee", "cafe", "shop", "near", "sjsu", "rating", "compare", "hours", "distance", "campus", "nearby", "boba", "tea", "restaurant"],
    userInstruction: "Find 3 highly-rated coffee shops near SJSU, compare rating + distance, then open the best one and read hours.",
    reference: `→ Searched Google for "best rated coffee shops near SJSU"
→ Found 3 options: Philz Coffee (4.5★, 5min walk), Academic Coffee (4.6★, 2min), B2 Coffee (4.4★, 7min)
→ Opened Academic Coffee for detail page
→ Done: "Academic Coffee is your best bet — 4.6 stars, two-minute walk from SJSU. Open today 7 AM to 6 PM. Known for pour-overs, great study vibe. Want directions or should I check out Philz instead?"`,
    agents: ["Navigator"],
  },
  {
    id: "restaurant-decision",
    title: "Restaurant Decision Support",
    keywords: ["restaurant", "ramen", "food", "dining", "eat", "open", "rating", "price", "cheap", "best", "sushi", "pizza", "burger", "thai", "chinese", "mexican", "indian"],
    userInstruction: "Find top ramen spots in SF under $$ and tell me which one is open now with best rating.",
    reference: `→ Searched Google for "best ramen SF under $$ open now"
→ Extracted top results: Marufuku (4.4★, open til 10PM), Mensho Tokyo (4.3★, open til 9PM), Ramen Nagi (4.2★, closed)
→ Done: "Marufuku Ramen is your best bet — 4.4 stars, open til 10 tonight, right in Japantown. Their hakata tonkotsu is what everyone raves about. Mensho Tokyo's also open if you want something different — they have a wild lamb ramen. Want me to get directions to Marufuku?"`,
    agents: ["Navigator"],
  },
  {
    id: "event-discovery",
    title: "Event Discovery",
    keywords: ["event", "meetup", "conference", "free", "tech", "week", "weekend", "date", "signup", "register", "ticket", "workshop", "talk"],
    userInstruction: "Find a free tech event this week in San Jose and summarize date, location, and signup link.",
    reference: `→ Searched Google for "free tech events San Jose this week 2026"
→ Opened Eventbrite results, extracted event details
→ Done: "Found a Silicon Valley AI & ML Meetup this Thursday, Feb 19th, 6 to 8:30 PM at the San Jose Convention Center. Totally free, about 40 spots left. They're doing a panel on practical AI with folks from Google. Want me to open the signup page?"`,
    agents: ["Navigator"],
  },
  {
    id: "dmv-appointment",
    title: "Public Service Navigation",
    keywords: ["dmv", "appointment", "booking", "government", "service", "license", "renewal", "passport", "social security", "public", "irs", "tax"],
    userInstruction: "Find DMV appointment info for San Jose and walk me to the exact booking page.",
    reference: `→ Searched Google for "San Jose DMV appointment booking"
→ Opened dmv.ca.gov, clicked "Make an Appointment"
→ Selected San Jose office, navigated to calendar
→ Narrated: "Two DMV offices in San Jose — Alma Avenue has more availability. I'm on the appointment type page now. Options: Driver License, Registration, Written Test, Behind the Wheel. Which one?"
→ User said "driver license renewal"
→ Done: "Earliest appointment is next Tuesday at 9:40 AM at the Alma Avenue DMV. Also Wednesday afternoon slots at 1:20 and 2:40. You'll need your license number and some personal info. Want me to walk through the form fields?"`,
    agents: ["Navigator"],
  },
  {
    id: "product-research",
    title: "Product Research & Comparison",
    keywords: ["protein", "product", "compare", "price", "ingredients", "review", "recommend", "whey", "supplement", "headphones", "laptop", "phone", "buy", "shopping", "amazon", "target", "walmart"],
    userInstruction: "Find two whey protein options, compare price per ounce and ingredients, and recommend one.",
    reference: `→ Searched Amazon for whey protein, extracted top 2 results with details
→ Optimum Nutrition Gold Standard: $62/5lb (78¢/oz), 24g protein, whey isolate, 4.7★ (80K reviews)
→ Dymatize ISO100: $48/3lb ($1/oz), 25g protein, hydrolyzed isolate, lactose-free
→ Done: "Go with Optimum Nutrition — cheaper per ounce at 78 cents, 4.7 stars with 80,000 reviews, clean ingredients. Dymatize is only worth it if you need lactose-free. Want me to pull one up so you can grab it?"`,
    agents: ["Navigator"],
  },
  {
    id: "transit-directions",
    title: "Transit / Route Planning",
    keywords: ["transit", "directions", "route", "bus", "train", "bart", "caltrain", "commute", "transfer", "drive", "walk", "bike", "uber", "lyft", "maps", "ferry"],
    userInstruction: "Get transit directions from SJSU to San Francisco Ferry Building and summarize transfers and total time.",
    reference: `→ Searched Google Maps for transit directions SJSU → SF Ferry Building
→ Extracted route options with transfers
→ Done: "Best route is about an hour 20 total — VTA Light Rail to Diridon, Caltrain to SF 4th & King, then walk or grab the N-Judah to the Ferry Building. Two transfers. There's also a BART option but takes longer since you'd need to bus to Milpitas first. Want me to check next departure times?"`,
    agents: ["Navigator"],
  },
  {
    id: "news-digest",
    title: "News Digest & Source Comparison",
    keywords: ["news", "article", "update", "compare", "sources", "summary", "latest", "report", "politics", "tech", "ai", "regulation", "bill"],
    userInstruction: "Find latest updates on the AI regulation bill, compare 3 sources, and summarize key differences.",
    reference: `→ Searched Google for latest news, opened Reuters, TechCrunch, AP News
→ Extracted key points from each
→ Done: "Three different takes — Reuters is playing it as a political win, bipartisan transparency requirements. TechCrunch is worried about startup compliance costs, mentions pushback from a16z. AP just lays out the facts — mandatory safety testing above a compute threshold, new federal oversight board. The framing is the big difference between them. Want me to dig into any of these?"`,
    agents: ["Navigator"],
  },
  {
    id: "form-assistance",
    title: "Form Assistance & Accessibility",
    keywords: ["form", "application", "scholarship", "fields", "required", "apply", "fill", "submit", "registration", "signup", "application"],
    userInstruction: "Open the SJSU scholarship application, list required fields, and tell me what info I need ready.",
    reference: `→ Found SJSU ScholarshipUniverse portal, opened application page
→ Extracted all form fields and requirements
→ Done: "You'll need: SJSU ID, full name, email, phone, major, GPA, graduation date, units completed, FAFSA status, a 500-word personal statement, and one professor's email for a rec letter. Deadline is March 15th. Whole thing takes about 30 minutes if you have everything. Want me to go through any section in detail?"`,
    agents: ["Navigator"],
  },
  {
    id: "treehacks-research",
    title: "Multi-Turn Research — TreeHacks / Hackathon",
    keywords: ["treehacks", "hackathon", "hack", "sponsors", "prizes", "tracks", "stanford", "competition", "demo", "project", "hacking"],
    userInstruction: "What is TreeHacks 2026? Who are the sponsors? What are the prize tracks? Where is it?",
    reference: `Turn 1 — "What is TreeHacks 2026?"
→ Done: "TreeHacks is Stanford's big annual hackathon — Feb 14-16, about 1,500 hackers, 36-hour event. Free if you got accepted. Want me to check tracks, sponsors, or prizes?"

Turn 2 — "Who are the sponsors?"
→ Done: "Headline sponsors: Google, Meta, OpenAI. Mid-tier: Anthropic, Databricks, Scale AI, Figma. Plus a16z, Convex, Warp, and others. A lot of them run their own prize tracks too. Want me to check those out?"

Turn 3 — "What are the prize tracks?"
→ Done: "Main tracks: Healthcare, Education, Sustainability, and a Moonshot wildcard. Sponsor prizes include best-use-of-Gemini from Google, best AI agent from OpenAI, and responsible AI from Anthropic. Grand prizes around $2-5K per team. Want to know where it's at?"

Turn 4 — "Where is it exactly?"
→ Done: "Arrillaga Alumni Center, 326 Galvez Street on Stanford campus. Closest parking is Galvez Lot, Caltrain station is a 15-min walk with a free shuttle. Need anything else?"`,
    agents: ["Navigator"],
  },

  // ── Multi-agent flows ──
  {
    id: "sketchy-link-guardian",
    title: "Sketchy Link Protection (Guardian)",
    keywords: ["link", "url", "suspicious", "sketchy", "scam", "phishing", "spam", "bit.ly", "tinyurl", "click", "sent me", "someone sent", "weird", "free", "prize", "winner"],
    userInstruction: "Hey, my friend sent me this link, can you check it out? bit.ly/free-prizes-2026",
    reference: `→ Orchestrator recognized suspicious shortened URL → called safety_check
→ [Guardian] Analyzed: shortened URL (bit.ly) + "free prizes" pattern = HIGH phishing risk. BLOCKED.
→ Orchestrator: "Heads up — that link looks really sketchy. It's a shortened URL with 'free prizes' which is a classic phishing pattern. I'd definitely skip it. If your friend was trying to share something legit, ask them for the actual link. Want me to help with anything else?"

Key: Guardian intercepted BEFORE Navigator even opened the link. Blind users can't see URL red flags, so this protection is critical.`,
    agents: ["Orchestrator", "Guardian"],
  },
  {
    id: "scribe-memory-preferences",
    title: "Personalized Browsing (Scribe + Navigator)",
    keywords: ["remember", "preference", "allergy", "allergic", "favorite", "usual", "always", "last time", "i like", "i prefer", "i'm", "i am", "dietary", "vegan", "vegetarian", "gluten", "peanut", "dairy"],
    userInstruction: "Remember that I'm allergic to peanuts and I prefer spicy food. Then find me a Thai restaurant.",
    reference: `Turn 1 — "Remember that I'm allergic to peanuts and prefer spicy food"
→ Orchestrator called remember(store, "allergies", "peanuts") and remember(store, "food_preference", "spicy")
→ [Scribe] Stored: allergies = "peanuts", food_preference = "spicy"
→ Orchestrator: "Got it, I'll remember that!"

Turn 2 — "Find me a Thai restaurant nearby"
→ [Scribe] Loaded preferences: allergies=peanuts, food_preference=spicy
→ Orchestrator passed to Navigator with context: user allergic to peanuts, prefers spicy
→ Navigator searched with peanut-allergy awareness, highlighted spicy dishes
→ Done: "Found Farmhouse Kitchen Thai — 4.5 stars, 10 min away. They mark allergens on their menu and their Pad Krapow is super spicy and peanut-free. There's also Kin Khao with 4.3 stars — more upscale, great curries. Want me to check either menu in detail?"

Key: Scribe provided user preferences BEFORE Navigator searched, so results were personalized from the start.`,
    agents: ["Orchestrator", "Scribe", "Navigator"],
  },
  {
    id: "full-council-shopping",
    title: "Full Council — Shopping with Safety Check",
    keywords: ["deal", "cheap", "discount", "suspicious", "site", "too good", "scam", "fake", "third party", "reseller", "knockoff", "counterfeit"],
    userInstruction: "Find the best deal on Sony WH-1000XM5 headphones",
    reference: `→ [Scribe] Loaded preferences: user prefers Sony brand (from past interaction)
→ Navigator searched Google + Amazon for Sony WH-1000XM5
→ Narrated: "Best price on Amazon is $298 with 4.7 stars. But I also found a site called 'deals4cheap.biz' offering them for $89 — that's way below retail."
→ User: "Get the $89 one!"
→ Orchestrator called safety_check on deals4cheap.biz
→ [Guardian] Analyzed: unknown domain, price 70% below retail, no HTTPS, no reviews = SCAM LIKELY. BLOCKED.
→ Orchestrator: "Whoa, hold on — that site is super sketchy. The price is way below what these headphones actually cost, and the site has no reviews or secure connection. Classic scam. The Amazon one at $298 is legit and has a 4.7 rating. Want me to grab it from Amazon instead?"

Key: Guardian protected the user from a scam site they couldn't visually evaluate. Navigator found options, Guardian vetted them, Orchestrator communicated naturally.`,
    agents: ["Orchestrator", "Scribe", "Navigator", "Guardian"],
  },
];

/**
 * Find the most similar playbook flow for a given instruction.
 * Uses keyword overlap scoring — fast, no LLM call needed.
 * Returns null if no flow matches above the threshold.
 */
export function findSimilarFlow(instruction: string): PlaybookFlow | null {
  const words = tokenize(instruction);
  if (words.length === 0) return null;

  let bestFlow: PlaybookFlow | null = null;
  let bestScore = 0;

  for (const flow of FLOWS) {
    let score = 0;
    for (const word of words) {
      // Check keywords
      if (flow.keywords.some((kw) => kw === word || word.includes(kw) || kw.includes(word))) {
        score += 2;
      }
      // Check title words
      if (flow.title.toLowerCase().includes(word)) {
        score += 1;
      }
      // Check user instruction
      if (flow.userInstruction.toLowerCase().includes(word)) {
        score += 1;
      }
    }

    // Normalize by word count to not penalize short instructions
    const normalizedScore = score / Math.max(words.length, 1);

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestFlow = flow;
    }
  }

  // Threshold: need at least 1.5 normalized score to be a meaningful match
  // (i.e., multiple keyword hits relative to instruction length)
  if (bestScore < 1.5) return null;

  return bestFlow;
}

/** Get all flows (for listing/debugging) */
export function getAllFlows(): PlaybookFlow[] {
  return [...FLOWS];
}

// ── Helpers ──

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "it", "this", "that", "can", "you", "me",
  "my", "i", "we", "do", "what", "how", "where", "when", "which",
  "from", "up", "out", "if", "about", "into", "then", "some", "so",
  "tell", "show", "give", "get", "find", "look", "check", "please",
  "also", "just", "really", "very", "most", "best", "top", "good",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
