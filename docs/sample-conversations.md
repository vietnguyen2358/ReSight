# ReSite Sample Conversation Flows

Reference conversations showing how ReSite handles real browsing tasks for visually impaired users. Each flow demonstrates the full pipeline: user voice input → Groq Whisper STT → orchestrator → navigator (with Stagehand browser automation) → conversational narration → spoken response via TTS (ElevenLabs if configured, Deepgram fallback). During processing, Narrator thoughts are spoken aloud as progress updates so the user always knows what's happening.

These are written as if they ran through the live app with Browserbase/Stagehand.

---

## 1. Trip Planning Lite — Coffee Shops Near SJSU

**User:** "Find 3 highly-rated coffee shops near SJSU, compare rating and distance, then open the best one and read hours."

> **[Navigator]** Searching Google for "best rated coffee shops near SJSU"...
>
> **Narrator** *(thinking)*: Alright, Google's got some good results! Here are three highly-rated spots near San Jose State: Philz Coffee on South 1st Street has a 4.5 rating and it's about a 5-minute walk from campus. Then there's Academic Coffee on East San Fernando — 4.6 stars, super close, basically right across the street. And B2 Coffee on South 2nd has 4.4 stars, maybe a 7-minute walk. Academic Coffee is looking like the winner here — highest rating and closest. Want me to pull up their details?
>
> **[Navigator]** Opening Academic Coffee on Google Maps...
>
> **[Navigator]** Extracting hours and details...
>
> **Narrator** *(answer)*: Okay so Academic Coffee is your best bet — 4.6 stars and literally a two-minute walk from SJSU. They're open today from 7 AM to 6 PM. They're known for their pour-overs and they've got a nice study-friendly vibe. Philz is also great if you want something a bit more lively — they're open 5 AM to 8 PM. Want me to get directions to Academic Coffee or check out Philz instead?

**Final spoken response:** "Okay so Academic Coffee is your best bet — 4.6 stars and literally a two-minute walk from SJSU. They're open today from 7 AM to 6 PM. They're known for their pour-overs and they've got a nice study-friendly vibe. Philz is also great if you want something a bit more lively — they're open 5 AM to 8 PM. Want me to get directions to Academic Coffee or check out Philz instead?"

---

## 2. Restaurant Decision Support — Ramen in SF

**User:** "Find top ramen spots in SF under double dollar sign and tell me which one is open now with best rating."

> **[Navigator]** Searching Google for "best ramen SF under $$ open now"...
>
> **[Navigator]** Extracting restaurant info from results...
>
> **Narrator** *(thinking)*: Found some awesome ramen spots! Let me compare these for you real quick. Marufuku Ramen in Japantown has 4.4 stars — their tonkotsu is legendary but they're on the pricier side of $$. Mensho Tokyo in the Tenderloin has 4.3 stars and they've got this unique lamb ramen. Ramen Nagi in Palo Alto Heights has 4.2 stars with a great spicy option.
>
> **[Navigator]** Checking which are open right now...
>
> **Narrator** *(answer)*: Okay so right now, Marufuku Ramen is open — they close at 10 PM tonight and they've got the highest rating at 4.4 stars. Mensho Tokyo is also open until 9 PM. Ramen Nagi is closed right now unfortunately. I'd go with Marufuku — best rating and still open with plenty of time. Their hakata-style tonkotsu is what everyone raves about, and it's right in Japantown so the vibe is great. Want me to pull up their menu or get directions?

**Final spoken response:** "Okay so right now, Marufuku Ramen is open — they close at 10 PM tonight and they've got the highest rating at 4.4 stars. Mensho Tokyo is also open until 9 PM. Ramen Nagi is closed right now unfortunately. I'd go with Marufuku — best rating and still open with plenty of time. Their hakata-style tonkotsu is what everyone raves about, and it's right in Japantown so the vibe is great. Want me to pull up their menu or get directions?"

---

## 3. Event Discovery — Free Tech Events in San Jose

**User:** "Find a free tech event this week in San Jose and summarize date, location, and signup link."

> **[Navigator]** Searching Google for "free tech events San Jose this week 2026"...
>
> **[Navigator]** Opening Eventbrite results...
>
> **[Navigator]** Extracting event details...
>
> **Narrator** *(thinking)*: Found a couple options on Eventbrite! There's a "Silicon Valley AI & ML Meetup" happening this Thursday, February 19th from 6 to 8:30 PM at the San Jose Convention Center. It's free and they've still got spots open. There's also a "Hack Night at SJSU" on Wednesday the 18th, free for students, at the MLK Library.
>
> **Narrator** *(answer)*: Alright, best one I found is the Silicon Valley AI and ML Meetup — this Thursday, February 19th, 6 to 8:30 PM at the San Jose Convention Center on South Market Street. It's totally free, you just need to RSVP on Eventbrite. There are about 40 spots left. They're doing a panel on practical AI applications with some folks from Google and a local startup. Want me to open the signup page so you can register, or check out the Wednesday hack night instead?

**Final spoken response:** "Alright, best one I found is the Silicon Valley AI and ML Meetup — this Thursday, February 19th, 6 to 8:30 PM at the San Jose Convention Center on South Market Street. It's totally free, you just need to RSVP on Eventbrite. There are about 40 spots left. They're doing a panel on practical AI applications with some folks from Google and a local startup. Want me to open the signup page so you can register, or check out the Wednesday hack night instead?"

---

## 4. Public Service Navigation — DMV Appointment Booking

**User:** "Find DMV appointment info for San Jose and walk me to the exact booking page."

> **[Navigator]** Searching Google for "San Jose DMV appointment booking"...
>
> **Narrator** *(thinking)*: Okay, found the California DMV site. There are two DMV offices in San Jose — one on Alma Avenue and one on Younger Avenue downtown. The Alma one tends to have more availability. Let me get you to the booking page.
>
> **[Navigator]** Opening dmv.ca.gov appointment page...
>
> **[Navigator]** Clicking on "Make an Appointment"...
>
> **[Navigator]** Selecting "San Jose" office...
>
> **Narrator** *(thinking)*: Nice, I'm on the appointment booking page now. It's asking what type of appointment you need — the options are: Driver License or ID Card, Vehicle Registration, Written Test, or Behind the Wheel Test. Which one do you need?

**User:** "Driver license renewal"

> **[Navigator]** Selecting "Driver License or ID Card"...
>
> **[Navigator]** Clicking "Continue"...
>
> **Narrator** *(answer)*: Alright, I've got the calendar up for the San Jose DMV on Alma Avenue. The earliest available appointment is next Tuesday, February 24th at 9:40 AM. There are also slots on Wednesday the 25th in the afternoon — 1:20 PM and 2:40 PM. To book, you'd need to enter your driver license number and some personal info. Want me to walk you through the form fields so you know what to have ready, or do you want to pick a date first?

**Final spoken response:** "Alright, I've got the calendar up for the San Jose DMV on Alma Avenue. The earliest available appointment is next Tuesday, February 24th at 9:40 AM. There are also slots on Wednesday the 25th in the afternoon — 1:20 PM and 2:40 PM. To book, you'd need to enter your driver license number and some personal info. Want me to walk you through the form fields so you know what to have ready, or do you want to pick a date first?"

---

## 5. Health/Product Research — Whey Protein Comparison

**User:** "Find two whey protein options, compare price per ounce and ingredients, and recommend one."

> **[Navigator]** Searching Google for "best whey protein powder compare price ingredients"...
>
> **[Navigator]** Opening Amazon search for whey protein...
>
> **[Navigator]** Extracting product details for top results...
>
> **Narrator** *(thinking)*: Okay I've got two solid options to compare! First is Optimum Nutrition Gold Standard Whey — 5-pound tub for $62, which works out to about 78 cents per ounce. It's got 24 grams of protein per scoop with whey isolate as the main ingredient, plus some cocoa and natural flavors. Then there's Dymatize ISO100 — 3-pound tub for $48, so that's about a dollar per ounce but it's a hydrolyzed isolate which is more processed and absorbs faster. Also 25 grams of protein per scoop.
>
> **Narrator** *(answer)*: So here's the breakdown — Optimum Nutrition Gold Standard is the better value at 78 cents per ounce versus Dymatize at about a dollar per ounce. Both have similar protein counts, around 24-25 grams per scoop. The big difference is Dymatize ISO100 is hydrolyzed, so it digests a bit faster and it's lactose-free, which is nice if your stomach is sensitive. But for most people, I'd say go with the Optimum Nutrition — it's cheaper, has a 4.7 star rating with like 80,000 reviews, and the ingredient list is cleaner. The Dymatize is worth the extra cost only if you really need that fast absorption or lactose-free formula. Want me to pull up either of these on Amazon so you can grab one?

**Final spoken response:** "So here's the breakdown — Optimum Nutrition Gold Standard is the better value at 78 cents per ounce versus Dymatize at about a dollar per ounce. Both have similar protein counts, around 24-25 grams per scoop. The big difference is Dymatize ISO100 is hydrolyzed, so it digests a bit faster and it's lactose-free, which is nice if your stomach is sensitive. But for most people, I'd say go with the Optimum Nutrition — it's cheaper, has a 4.7 star rating with like 80,000 reviews, and the ingredient list is cleaner. The Dymatize is worth the extra cost only if you really need that fast absorption or lactose-free formula. Want me to pull up either of these on Amazon so you can grab one?"

---

## 6. Transit/Route Planning — SJSU to SF Ferry Building

**User:** "Get transit directions from SJSU to San Francisco Ferry Building and summarize transfers and total time."

> **[Navigator]** Searching Google for "transit directions SJSU to San Francisco Ferry Building"...
>
> **[Navigator]** Opening Google Maps transit directions...
>
> **[Navigator]** Extracting route options...
>
> **Narrator** *(answer)*: Okay so the best transit option is about an hour and 20 minutes total. Here's the route — you'd take VTA Light Rail from the San Fernando station near SJSU, ride that to the Diridon station which is about 15 minutes. Then transfer to Caltrain heading north to San Francisco, that's about 55 minutes to the SF 4th and King station. From there you hop on the N-Judah Muni line or just walk about 20 minutes along the Embarcadero to the Ferry Building. One transfer on Caltrain, one on Muni — or skip Muni and walk if the weather's nice. There's also a BART option but it takes a bit longer at about an hour and 40 minutes because you'd need to bus to Milpitas BART first. I'd go with the Caltrain route. Want me to check the next departure times?

**Final spoken response:** "Okay so the best transit option is about an hour and 20 minutes total. Here's the route — you'd take VTA Light Rail from the San Fernando station near SJSU, ride that to the Diridon station which is about 15 minutes. Then transfer to Caltrain heading north to San Francisco, that's about 55 minutes to the SF 4th and King station. From there you hop on the N-Judah Muni line or just walk about 20 minutes along the Embarcadero to the Ferry Building. One transfer on Caltrain, one on Muni — or skip Muni and walk if the weather's nice. There's also a BART option but it takes a bit longer at about an hour and 40 minutes because you'd need to bus to Milpitas BART first. I'd go with the Caltrain route. Want me to check the next departure times?"

---

## 7. News Digest — Comparing Sources on a Topic

**User:** "Find latest updates on the AI regulation bill in Congress, compare 3 sources, and summarize key differences."

> **[Navigator]** Searching Google for "AI regulation bill Congress 2026 latest news"...
>
> **[Navigator]** Opening Reuters article...
>
> **[Navigator]** Extracting key points...
>
> **[Navigator]** Opening TechCrunch article...
>
> **[Navigator]** Extracting key points...
>
> **[Navigator]** Opening AP News article...
>
> **[Navigator]** Extracting key points...
>
> **Narrator** *(answer)*: Alright, I checked three sources on the AI regulation bill. Here's the deal — Reuters is reporting that the Senate committee passed the bill this week with a 14-9 vote, and they're focusing on the bipartisan angle, saying both sides agreed on the transparency requirements for AI companies. TechCrunch has a more critical take — they're highlighting concerns from tech companies that the compliance costs could hurt startups, and they mention specific pushback from a16z and Y Combinator. AP News is somewhere in the middle — they're focused on what the bill actually requires, which is mandatory safety testing for AI models above a certain compute threshold and a new federal oversight board. The big difference between the sources is really the framing — Reuters is playing it as a political win, TechCrunch is worried about industry impact, and AP is just laying out the facts. Want me to dig deeper into any of these or find what specific companies are saying about it?

**Final spoken response:** "Alright, I checked three sources on the AI regulation bill. Here's the deal — Reuters is reporting that the Senate committee passed the bill this week with a 14-9 vote, and they're focusing on the bipartisan angle, saying both sides agreed on the transparency requirements for AI companies. TechCrunch has a more critical take — they're highlighting concerns from tech companies that the compliance costs could hurt startups, and they mention specific pushback from a16z and Y Combinator. AP News is somewhere in the middle — they're focused on what the bill actually requires, which is mandatory safety testing for AI models above a certain compute threshold and a new federal oversight board. The big difference between the sources is really the framing — Reuters is playing it as a political win, TechCrunch is worried about industry impact, and AP is just laying out the facts. Want me to dig deeper into any of these or find what specific companies are saying about it?"

---

## 8. Form Assistance — Scholarship Application Fields

**User:** "Open the SJSU scholarship application page, list required fields, and tell me what info I need ready."

> **[Navigator]** Searching Google for "SJSU scholarship application 2026"...
>
> **[Navigator]** Opening SJSU financial aid scholarships page...
>
> **[Navigator]** Clicking on "Apply for Scholarships"...
>
> **[Navigator]** Extracting form fields and requirements...
>
> **Narrator** *(thinking)*: Okay, I found the SJSU General Scholarship Application through their ScholarshipUniverse portal. Let me read through what they need from you.
>
> **Narrator** *(answer)*: Alright, here's what you'll need to have ready for the SJSU scholarship application. First, the basics — your SJSU student ID number, full legal name, email, phone number, and your major. Then they want your academic info — current GPA, expected graduation date, and how many units you've completed. There's a financial section where they ask about your FAFSA status and estimated family contribution. The big one is the personal statement — they want 500 words max about your academic goals and any hardships you've overcome. And lastly, they ask for one letter of recommendation, which you'd need to get a professor's email so the system can send them a request. The deadline is March 15th, 2026. The whole thing should take about 30 minutes if you have everything ready. Want me to go through any section in more detail or help you figure out what to write for the personal statement?

**Final spoken response:** "Alright, here's what you'll need to have ready for the SJSU scholarship application. First, the basics — your SJSU student ID number, full legal name, email, phone number, and your major. Then they want your academic info — current GPA, expected graduation date, and how many units you've completed. There's a financial section where they ask about your FAFSA status and estimated family contribution. The big one is the personal statement — they want 500 words max about your academic goals and any hardships you've overcome. And lastly, they ask for one letter of recommendation, which you'd need to get a professor's email so the system can send them a request. The deadline is March 15th, 2026. The whole thing should take about 30 minutes if you have everything ready. Want me to go through any section in more detail or help you figure out what to write for the personal statement?"

---

## 9. Multi-Turn Research — TreeHacks 2026

This flow demonstrates a natural multi-turn conversation where the user keeps asking follow-up questions about the same topic, and ReSite maintains context across turns.

**User:** "What is TreeHacks 2026?"

> **[Navigator]** Searching Google for "TreeHacks 2026"...
>
> **[Navigator]** Opening treehacks.com...
>
> **[Navigator]** Extracting event details...
>
> **Narrator** *(answer)*: TreeHacks is Stanford's big annual hackathon! The 2026 edition is happening February 14th through 16th — so literally this weekend — at Stanford University. It's one of the largest collegiate hackathons in the country, usually around 1,500 hackers. It's a 36-hour event where teams build projects around different tracks. It's free to attend if you got accepted. Want me to look into anything specific — like the tracks, sponsors, or prizes?

**Final spoken response:** "TreeHacks is Stanford's big annual hackathon! The 2026 edition is happening February 14th through 16th — so literally this weekend — at Stanford University. It's one of the largest collegiate hackathons in the country, usually around 1,500 hackers. It's a 36-hour event where teams build projects around different tracks. It's free to attend if you got accepted. Want me to look into anything specific — like the tracks, sponsors, or prizes?"

**User:** "Yeah, who are the sponsors?"

> **[Navigator]** Scrolling to sponsors section on treehacks.com...
>
> **[Navigator]** Extracting sponsor info...
>
> **Narrator** *(answer)*: Nice lineup of sponsors this year! The big headline sponsors are Google, Meta, and OpenAI. Then there are a bunch of mid-tier sponsors like Anthropic, Databricks, Scale AI, and Figma. And a ton of smaller sponsors and partners — looks like a16z, Convex, Warp, and a few others. A lot of the sponsors also run their own prize tracks, which is pretty cool. Want me to check out what prize tracks they're offering?

**Final spoken response:** "Nice lineup of sponsors this year! The big headline sponsors are Google, Meta, and OpenAI. Then there are a bunch of mid-tier sponsors like Anthropic, Databricks, Scale AI, and Figma. And a ton of smaller sponsors and partners — looks like a16z, Convex, Warp, and a few others. A lot of the sponsors also run their own prize tracks, which is pretty cool. Want me to check out what prize tracks they're offering?"

**User:** "Yes! What are the prize tracks?"

> **[Navigator]** Opening prizes/tracks page on treehacks.com...
>
> **[Navigator]** Extracting track details...
>
> **Narrator** *(answer)*: Okay so there are a few main tracks this year. There's a Healthcare track focused on AI applications in medicine, an Education track for tools that help people learn, a Sustainability track for environmental impact projects, and a general "Moonshot" track for anything wildly ambitious. On top of those, sponsors have their own prizes — Google has a best-use-of-Gemini-API prize, OpenAI has one for best AI agent, and Anthropic's got a responsible AI award. The grand prizes for the main tracks are usually around $2,000 to $5,000 per team. Want to know where exactly at Stanford this is happening?

**Final spoken response:** "Okay so there are a few main tracks this year. There's a Healthcare track focused on AI applications in medicine, an Education track for tools that help people learn, a Sustainability track for environmental impact projects, and a general Moonshot track for anything wildly ambitious. On top of those, sponsors have their own prizes — Google has a best-use-of-Gemini-API prize, OpenAI has one for best AI agent, and Anthropic's got a responsible AI award. The grand prizes for the main tracks are usually around $2,000 to $5,000 per team. Want to know where exactly at Stanford this is happening?"

**User:** "Yeah, where is it exactly?"

> **[Navigator]** Searching for TreeHacks 2026 venue location...
>
> **[Navigator]** Extracting location details...
>
> **Narrator** *(answer)*: It's at the Arrillaga Alumni Center on Stanford campus — that's at 326 Galvez Street, Stanford, California. It's right in the middle of campus near the oval. They usually have the main hacking space in the big ballroom area, with sponsor booths and workshop rooms on the side. If you're driving, the closest parking is the Galvez Lot, and if you're coming by Caltrain, the Stanford station is about a 15-minute walk or there's a free Stanford shuttle. Need anything else about TreeHacks?

**Final spoken response:** "It's at the Arrillaga Alumni Center on Stanford campus — that's at 326 Galvez Street, Stanford, California. It's right in the middle of campus near the oval. They usually have the main hacking space in the big ballroom area, with sponsor booths and workshop rooms on the side. If you're driving, the closest parking is the Galvez Lot, and if you're coming by Caltrain, the Stanford station is about a 15-minute walk or there's a free Stanford shuttle. Need anything else about TreeHacks?"

---

## Multi-Agent Flows

These scenarios demonstrate how multiple agents in the ReSite Council coordinate to protect and assist the user. Each agent has a distinct role visible in the thought stream.

### 10. Guardian Intercept — Sketchy Link Protection

**Agents involved:** Orchestrator → Guardian → Orchestrator (Navigator never touches the link)

**User:** "Hey, my friend sent me this link, can you check it out? bit.ly/free-prizes-2026"

> **[Orchestrator]** Detected suspicious URL pattern — routing to safety check before browsing
>
> **[Guardian]** Analyzing: "bit.ly/free-prizes-2026" — shortened URL (bit.ly) + "free prizes" keyword pattern...
>
> **[Guardian]** BLOCKED [phishing]: Shortened URL combined with "free prizes" is a classic phishing pattern. High risk of credential theft or malware.
>
> **Narrator** *(answer)*: Heads up — that link looks really sketchy. It's a shortened URL with "free prizes" in it, which is a textbook phishing pattern. Could lead to a fake page trying to steal your info. I'd definitely skip it. If your friend was trying to share something real, ask them to send you the actual full link instead. Want me to help with anything else?

**Final spoken response:** "Heads up — that link looks really sketchy. It's a shortened URL with 'free prizes' in it, which is a textbook phishing pattern. Could lead to a fake page trying to steal your info. I'd definitely skip it. If your friend was trying to share something real, ask them to send you the actual full link instead. Want me to help with anything else?"

**Why this matters for blind users:** A sighted person might hover over the link, see the suspicious URL preview, notice the sketchy landing page design, or read the fine print. A blind user can't do any of that — the Guardian agent acts as their safety net, catching red flags they literally cannot see.

---

### 11. Scribe Memory + Navigator — Personalized Browsing

**Agents involved:** Orchestrator → Scribe (store) → Scribe (recall) → Navigator

This is a multi-turn flow where the Scribe remembers user preferences and the Navigator uses them to personalize results.

**User (Turn 1):** "Remember that I'm allergic to peanuts and I prefer spicy food."

> **[Orchestrator]** Routing to memory storage
>
> **[Scribe]** Stored: allergies = "peanuts"
>
> **[Scribe]** Stored: food_preference = "spicy"
>
> **Narrator** *(answer)*: Got it, I'll remember that! Peanut allergy and spicy food — noted.

**Final spoken response:** "Got it, I'll remember that! Peanut allergy and spicy food — noted."

**User (Turn 2):** "Find me a Thai restaurant nearby"

> **[Scribe]** Loaded user preferences: allergies=peanuts, food_preference=spicy
>
> **[Scribe → Orchestrator]** User has 2 stored preferences: allergies, food_preference
>
> **[Orchestrator]** Passing to Navigator with preference context: user is allergic to peanuts and prefers spicy food
>
> **[Navigator]** Searching Google for "Thai restaurant near me peanut-free spicy"...
>
> **[Navigator]** Extracting restaurant details...
>
> **Narrator** *(answer)*: Found a great spot — Farmhouse Kitchen Thai! 4.5 stars, about 10 minutes away. They mark all allergens on their menu, and their Pad Krapow is super spicy and peanut-free. There's also Kin Khao with 4.3 stars if you want something more upscale — they're known for their curries and they can make most dishes without peanuts. Want me to check either of their menus in detail?

**Final spoken response:** "Found a great spot — Farmhouse Kitchen Thai! 4.5 stars, about 10 minutes away. They mark all allergens on their menu, and their Pad Krapow is super spicy and peanut-free. There's also Kin Khao with 4.3 stars if you want something more upscale — they're known for their curries and they can make most dishes without peanuts. Want me to check either of their menus in detail?"

**Why this matters for blind users:** The user doesn't have to repeat their dietary restrictions every single time. The Scribe remembers, and every future search is automatically personalized. For someone who can't quickly scan a menu for allergen warnings, this is life-changing.

---

### 12. Full Council — Shopping with Safety Intercept

**Agents involved:** Scribe (recall) → Navigator (search) → Guardian (safety check) → Orchestrator (routing)

This shows all four agents coordinating on a single task — the Scribe provides history, Navigator finds options, Guardian catches a scam, and Orchestrator communicates it all naturally.

**User:** "Find the best deal on Sony WH-1000XM5 headphones"

> **[Scribe]** Loaded preferences: preferred_brand = "Sony" (from previous session)
>
> **[Scribe → Orchestrator]** User has stored preference for Sony brand
>
> **[Navigator]** Searching Google for "Sony WH-1000XM5 headphones best price"...
>
> **[Navigator]** Checking Amazon, Best Buy, and other results...
>
> **[Navigator]** Extracting prices from multiple sources...
>
> **Narrator** *(thinking)*: Alright, I found several options. Amazon has them for $298 with 4.7 stars and Prime delivery. Best Buy has them at $299. But there's also this site called "deals4cheap.biz" listing them for $89 — that's weirdly cheap.

**User:** "Whoa, get the $89 one!"

> **[Orchestrator]** That price seems suspicious — routing to safety check before proceeding
>
> **[Guardian]** Analyzing: deals4cheap.biz offering Sony WH-1000XM5 at $89 (retail ~$300)...
>
> **[Guardian]** BLOCKED [scam]: Unknown domain, price 70% below retail, no HTTPS, no verifiable reviews. Classic counterfeit/scam storefront.
>
> **Narrator** *(answer)*: Whoa, hold on — I checked that site and it's super sketchy. The price is way below what these headphones actually cost anywhere else, and the site has no secure connection and zero real reviews. That's a classic scam storefront — you'd either get a counterfeit or nothing at all. The Amazon listing at $298 is legit, has a 4.7 rating, and comes with Prime shipping. Want me to grab it from Amazon instead?

**Final spoken response:** "Whoa, hold on — I checked that site and it's super sketchy. The price is way below what these headphones actually cost anywhere else, and the site has no secure connection and zero real reviews. That's a classic scam storefront — you'd either get a counterfeit or nothing at all. The Amazon listing at $298 is legit, has a 4.7 rating, and comes with Prime shipping. Want me to grab it from Amazon instead?"

**Why this matters for blind users:** A sighted user might notice the janky website design, missing HTTPS padlock, or fake-looking reviews. A blind user hears "$89 headphones" and reasonably wants them. The Guardian caught what they couldn't see, and the Orchestrator explained it in plain language without being preachy.

---

### 13. Guardian — Dark Pattern Detection During Checkout

**Agents involved:** Navigator (browsing) → Guardian (safety check) → Orchestrator

Shows the Guardian catching a dark pattern mid-checkout that a blind user would never notice.

**User:** "Add that protein powder to cart and check out"

> **[Navigator]** Clicking "Add to Cart"...
>
> **[Navigator]** Opening cart page...
>
> **[Navigator]** Clicking "Proceed to Checkout"...
>
> **[Navigator]** Extracting checkout page details...
>
> **[Orchestrator]** Checkout page has unexpected items — routing to safety check
>
> **[Guardian]** Analyzing checkout page: found pre-checked box for "$9.99/month Supplement Club subscription" and $4.99 "shipping protection" automatically added...
>
> **[Guardian]** BLOCKED [dark_pattern]: Pre-checked subscription box and auto-added shipping protection fee. These were not requested by the user and are designed to be missed.
>
> **Narrator** *(answer)*: Wait, heads up — I caught something sneaky on the checkout page. They pre-checked a box that signs you up for a $9.99 monthly "Supplement Club" subscription, and they auto-added a $4.99 shipping protection fee. Neither of those were things you asked for. Let me uncheck those for you before we proceed. Want me to clean that up and continue with just the protein powder?

**Final spoken response:** "Wait, heads up — I caught something sneaky on the checkout page. They pre-checked a box that signs you up for a $9.99 monthly Supplement Club subscription, and they auto-added a $4.99 shipping protection fee. Neither of those were things you asked for. Let me uncheck those for you before we proceed. Want me to clean that up and continue with just the protein powder?"

**Why this matters for blind users:** Dark patterns are literally designed to be visually deceptive — small text, pre-checked boxes, confusing layouts. A screen reader might read the text, but a blind user processing audio sequentially can easily miss a pre-checked box buried in a long checkout form. The Guardian catches what accessibility tools alone can't.

---

## Conversation Patterns to Notice

Across all flows, the conversational style follows these patterns:

1. **Navigator thoughts are subtle status updates** — "Searching Google for...", "Opening...", "Extracting..." show as small, muted internal status lines. They give a sense of progress without interrupting the conversation.

2. **Narrator speaks at milestones only** — The user gets 1-2 rich updates per task, not a play-by-play of every click and scroll.

3. **Every response ends with a natural follow-up** — "Want me to...", "Should I...", "Which one sounds good?" — keeps the conversation going without being formal.

4. **Specific facts over vague summaries** — Names, prices, ratings, times, addresses. Never "I found several options" without details.

5. **Friend-next-to-you tone** — "Okay so...", "Alright...", "Nice...", "Ooh..." — casual interjections that feel human, not "Based on my analysis..." or "I have retrieved the following information..."

6. **Multi-turn is natural** — In the DMV flow, the clarification question feels like a real conversation, not a form prompt. "Which one do you need?" not "Please select from the following service types."

7. **Multi-agent coordination is invisible to the user** — The user never hears "The Guardian agent has analyzed..." or "The Scribe agent recalled...". They just hear natural conversation. Agent names only appear in the collapsible thought trail for judges/developers.

8. **Guardian protects without being preachy** — When blocking something, it explains the specific red flags in plain language, not generic security warnings. "The price is way below retail and the site has no secure connection" not "This action has been flagged as potentially unsafe."

9. **Scribe makes the experience personal** — Preferences from past sessions carry forward. The user says their allergies once and never has to repeat them. This is how a real human friend would work — they remember your stuff.
