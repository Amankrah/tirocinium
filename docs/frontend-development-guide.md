# Frontend Development Guide
## Tirocinium: Case Study Practice Platform for University Students and Professors

Version 0.6 draft. Audience: frontend engineers joining the project. This guide defines the stack, brand, design direction, key surfaces, and engineering conventions for the Tirocinium frontend. The backend contract is defined in the companion backend guide and the generated OpenAPI spec.

---

## 1. What the frontend must achieve

Two audiences, two moods, one product. Professors author and review; they need calm, dense, efficient tooling. Students practice and submit; they need focus, momentum, and zero friction on the scan upload flow, which they will often do from a phone camera minutes before a deadline. Students are pseudonymous by design: they never sign up. They enter a seat code their professor gave them, and the interface addresses them only by seat number, which shapes the entry flow (section 4.0) and means there is no student account surface to build at all: no profiles, no password reset, no email verification. The visual ambition is high (this should look like a flagship product, not a courseware portal), but ambition is spent deliberately: one signature visual moment, restrained everywhere else, and copy that never wastes a word.

## 2. Stack

- **Next.js 15, App Router, TypeScript strict.** Server Components by default; client components only where interactivity demands it (upload flow, particle canvas, editors). This is asserted, not optional: the mix of content-heavy pages (case studies render beautifully as server-rendered markdown) and highly interactive islands is exactly what the App Router is for.
- **Styling**: Tailwind CSS v4 with a design token layer (CSS custom properties) defined once in `tokens.css`. No component library skin; we build our own primitives on Radix UI behaviors (dialog, popover, tabs) so accessibility semantics are correct without inheriting anyone's look.
- **Data**: typed API client generated from the backend's `openapi.json` (openapi-typescript plus a thin fetch wrapper). Server Components fetch directly; client mutations and polling go through TanStack Query. No global state library; URL state and Query cache cover this product.
- **Voice conversation**: the AI defense conversation (section 4.2) streams audio over a WebSocket to the backend. On the client this is a dedicated lazy-loaded module using the Web Audio API and MediaRecorder for capture and a small audio-playback queue for the streamed reply; it must handle microphone permission gracefully, show clear speaking and listening states, support interrupting the tutor (barge-in), and fall back to a typed interface when speech is unavailable. Never block the rest of the app on this module.
- **Math and content rendering**: markdown via `react-markdown` with KaTeX for mathematics, since both case studies and transcribed solutions contain LaTeX. Case study markdown also carries `fig://{id}` image tokens for the professor's diagrams and illustrations; a custom renderer component resolves these to short-lived signed URLs through `next/image`, using the stored intrinsic dimensions so figures never cause layout shift, serving the 2x rendition on high-density screens, and opening a full-resolution lightbox on tap. Figures render exactly as extracted from the professor's source, at their token position in the text, on every surface that shows a problem: practice view, print stylesheet, defense conversation, professor preview. There is no surface where a figure is summarized, omitted, or substituted.
- **Particle and motion layer**: a single WebGL canvas driven by raw WebGL2 or `ogl` (a 4 kB library), not three.js; we render points with a custom shader and do not need a scene graph. Micro-interactions use CSS transitions and the View Transitions API; do not add framer-motion unless a concrete need appears.

## 3. Design direction

### 3.1 The name and the brand

The platform is **Tirocinium** (pronounced *ti-ro-SIN-ee-um*). In ancient Rome the *tirocinium* was the formal period of learning by supervised practice: the *tirocinium fori* placed a young person alongside a jurist to learn law and rhetoric by working through real cases, and the *tirocinium militiae* trained recruits through drilled exercise before any real engagement. The word names exactly what this product does: mastery acquired by working cases under a professor's guidance, one attempt at a time. It survives in English as *tyro*, a beginner, so the academic community reads it on sight, and it is unclaimed in the software world, which almost no ancient learning term still is. Always written Tirocinium, capital T, never abbreviated to Tiro in any commercial or public context (the short form carries an existing educational-software trademark filing; the full word is ours to build on).

Brand rules, kept deliberately few:

- The wordmark is the display face at heavy optical size, set in ink on paper. No logo glyph at launch; the wordmark and the particle field are the identity.
- The tagline is "Every problem, freshly ruled." It appears on the landing hero and nowhere inside the app shell.
- The brand voice is the copy voice of section 3.4: plain, specific, confident. Tirocinium never calls itself revolutionary; the product's confidence is in how little it needs to say. The Roman story is told once, in a single quiet line on the landing page ("In Rome, you learned law by working cases beside a jurist. This is that, for your course."), and never repeated inside the product.
- The seat cards professors print (see 4.0b) are brand touchpoints: wordmark, course name, seat number, code, one rule line. They will be pinned to corkboards and slipped into notebooks; they should look worth keeping.

### 3.2 Design concept

The platform's world is the worked problem: graph paper, marginalia, the pleasure of a derivation that resolves. The design language borrows from that world rather than from dashboard templates.

Tokens (starting point, to be refined in design review):

- **Palette**: ink `#161A23` on paper `#FAFAF7`; accent `#2C5AE9` (a confident workbook blue used only for primary actions and live states); rule-line `#E4E4DC` for hairline structure; verify-green `#1D7A5F` and flag-amber `#B4690E` strictly for variant and recognition states. Dark mode inverts to `#12141A` ground with `#E8E6DF` ink; the accent stays.
- **Type**: a characterful display face for headings and the marketing shell (candidates: Newsreader or Fraunces, tuned optical size), Inter for interface text, JetBrains Mono for parameter values, seeds, and anything a professor might copy. Numeric data uses tabular figures everywhere.
- **Structure**: a visible baseline rhythm. Hairline rules and generous margins do the organizing; cards and shadows are used sparingly. Density increases on professor surfaces, opens up on student surfaces.

### 3.3 The particle simulation, and its one job

The signature moment is a particle field on the landing and course-home hero: a few thousand GPU-rendered points that drift as a loose scatter and, on load, resolve briefly into structure (a curve, a distribution, the suggestion of a solved problem) before relaxing back to ambient motion. Chaos resolving into understanding; that is the product's story told in motion, and it is the only place the effect appears.

Engineering rules for it, non-negotiable:

1. It lives in one lazy-loaded client component (`<ParticleField />`) rendered behind content with `pointer-events: none`. Content never waits for it; the page is complete and interactive before the canvas mounts.
2. All simulation runs on the GPU in the vertex shader (positions derived from time, seed, and a target-shape texture). No per-frame JavaScript loops over particles; the CPU cost per frame is one draw call.
3. Budget: under 3 ms GPU frame time on a 2019 mid-range laptop, capped particle count by `devicePixelRatio` and a quick capability check, and a static SVG fallback when WebGL2 is unavailable.
4. `prefers-reduced-motion` renders the resolved state as a still image. This is a hard accessibility requirement, not a nice-to-have.
5. The canvas pauses via `IntersectionObserver` when off-screen and on `visibilitychange`.

Nothing else on the platform animates ambiently. Everywhere else, motion is functional micro-interaction: 150 to 200 ms ease-out on state changes, a subtle progress shimmer on recognition processing, View Transitions between case study list and detail.

### 3.4 Copy principles

Copy is interface material. Rules for every string in the product:

- Say what the user does, not what the system is. "Upload your solution", never "Submit artifact for OCR ingestion".
- One job per string. A button names its action ("Publish case study"), the confirmation names the result ("Published").
- Errors state what happened and what to do next: "Page 3 is too blurry. Retake it in brighter light." No apologies, no vagueness.
- Empty states invite the next action in one sentence.
- Sentence case everywhere. No marketing adjectives inside the app shell; the work is the star.

All strings live in a typed strings module from day one (`strings.ts` per route group), which keeps copy reviewable in one place and leaves the door open for French localization, which a Canadian university deployment will eventually require.

## 4. Key surfaces

### 4.0 Student entry: the seat code

The student's first interaction with the product is typing a code, so it must feel like unlocking something rather than logging in. One screen: the course code field, formatted as it is typed into `XXXX-XXXX-XXXX-XXXX` groups with the Crockford alphabet enforced (paste handles any formatting), a single "Enter course" action, and nothing else. On success, a brief resolve into the course home with a greeting by seat number ("Seat 014, welcome to FDSC 315"). On failure, one honest line: "That code did not work. Check it against the card from your professor." No distinction between wrong, revoked, or malformed; the backend will not tell us and the copy should not pretend to know.

The session persists long-term on the device (the code is reusable, so re-entry on a new device is the recovery path; there is nothing to reset). The seat number appears quietly in the shell header so students always know which identity their work is filed under. Never invent a name field, an avatar, or any personalization that would tempt PII back into the product.

### 4.0b Professor: seats and codes

Inside course settings, a Seats panel: a count input and "Generate seats" for first-time setup, then a table of seat number, status, last active, and submission count. Generation ends in a one-time download moment that the interface must make unmissable: "Download your codes now. For privacy, we keep only a locked version and cannot show them again." Two artifacts download together: a CSV for the professor's own roster spreadsheet and a print-ready PDF of code cards (eight per page, cut lines, course name and seat number on each card) for handing out physically. Per-row actions are revoke and reissue, each with a plain confirmation stating the consequence ("Seat 023 keeps its submission history and gets a new code. The old code stops working now."). Since the platform never knows names, the table's empty column is deliberate: a hint line tells the professor to keep their seat-to-student mapping in their own records.

### 4.1 Student: practice flow

Course home lists case studies as a clean index (title, concept tags, attempts, personal state). Selecting one opens the problem view: the variant body rendered as typeset markdown and math, a distraction-free reading column around 68 characters wide, and a persistent action rail with "New variant" and "Upload solution". Requesting a new variant swaps in a pre-generated verified variant instantly (the backend keeps a pool; the frontend never shows a generation spinner in the practice loop).

The upload flow is the most engineered student surface:

1. Drag-and-drop or camera capture, multi-page, with instant client-side previews.
2. Client-side page checks before upload (file type, size, a cheap blur heuristic on a downscaled canvas) so obvious problems are caught in 100 ms rather than after a round trip.
3. Direct-to-storage upload via presigned URLs with per-page progress, retry per page, and reordering by drag.
4. After manifest submission, a processing state driven by SSE or polling shows per-page progress through preprocessing and recognition, ending with the transcription preview beside thumbnails. Low-confidence spans are highlighted with a prompt: "Check the highlighted lines match what you wrote."

This flow must be flawless on mobile Safari and Android Chrome, tested on real devices, because phone-camera capture is the dominant real-world path.

### 4.2 Student: the practice experience

This is the section that decides whether a student opens Tirocinium on a Tuesday night instead of a competitor, a group chat, or nothing. Everything here is built on one belief: the platform should make the effortful path feel better than the shortcut, rather than merely blocking the shortcut. Three mechanics carry that.

**The handwritten attempt, as a felt ritual, not a hurdle.** Writing by hand is the core act, and the interface should honor it rather than treat the scan as mere file upload. When a student starts a problem, they get a clean "start attempt" moment that timestamps the beginning, and the submission carries that span (started, submitted) as an honest record of engaged time. The value is real and we should say so plainly to students, without overclaiming: research using high-density EEG finds that writing by hand produces more widespread brain connectivity in the theta and alpha bands associated with memory and attention than typing does, which is part of why working a problem out on paper tends to bed the concept down more firmly than typing it. We present this once, as a short honest line in onboarding ("You write your solutions by hand because that is when the concept actually sticks"), and we do not dress it up as settled neuroscience, because our audience is academic and will (rightly) distrust a hard claim. The point the student feels is simpler: this platform respects that the work happens on paper, and it is designed around that act rather than fighting it.

**The AI defense conversation (voice), the signature learning moment.** After a student submits their handwritten solution, they can enter a spoken conversation with an AI tutor about what they just did. This is not the AI grading them and it is not the AI lecturing. It is a Socratic defense: the tutor has the problem, the professor's reference solution, and the transcription of the student's own handwritten work, and it asks the student to explain their reasoning out loud. "Walk me through why you set it up this way." "You assumed the rate was fixed. What happens if it isn't?" "That step is right, but can you say why it follows?"

The learning science behind this is stronger and more defensible than the handwriting claim, and it is the real pedagogical engine of the product. Two well-established effects combine here. Self-explanation, prompting a learner to articulate why a solution works rather than just producing it, reliably improves comprehension and transfer to new problems, which is exactly what parameterized variants demand. And spoken retrieval, having to reconstruct and voice the reasoning after the fact, is a form of the retrieval practice that is among the most robust findings in learning science for durable retention. Speaking is also higher-friction than clicking in the way that matters: it forces full articulation, it exposes the gaps where a student "sort of" knew something, and it cannot be faked by pattern-matching. A student who can defend their solution out loud has learned it. A student who can't has just discovered precisely what they need to revisit, which is the most useful thing a practice session can give them.

Design rules for the voice conversation:

- It is opt-in per attempt and never gates submission. The handwritten scan stands on its own; the conversation is the reward for having done the work, framed as "talk it through" rather than "now be tested again".
- The tutor is warm, curious, and never punitive. It celebrates correct reasoning, treats errors as interesting rather than shameful, and its job is to leave the student understanding more than when they started, not feeling caught out.
- It always has the student's actual work in context, so the conversation is about what they really wrote, including their mistakes, not a generic recap.
- It ends by naming, in one or two sentences, the single concept most worth revisiting, and offers a fresh variant that targets exactly that concept. This closes the loop: defend, discover the gap, practice the gap.
- Voice is the default because speaking is the point, but a typed fallback exists for accessibility, for quiet rooms, and for students who are more comfortable writing. The typed path preserves the self-explanation benefit even if it loses some of the retrieval-through-articulation edge.

The full engineering of this conversation (streaming voice, turn-taking latency, context assembly, safety, cost) is specified in backend section 6.5; the frontend requirement is that the conversation feel like talking to a sharp, encouraging teaching assistant who has actually read your work, with sub-second response so it never feels like waiting on a machine.

**The understanding unfold.** Independently of the conversation, the professor's worked solution is available after submission (or on giving up), and it unfolds step by step on interaction rather than arriving as a wall of text, so reading the solution is itself an act of engagement. Each revealed step can be sent straight into the voice conversation ("I don't understand this step") so the reference solution and the tutor work together.

### 4.2b Why a student stays

Blocking AI shortcuts is not a retention strategy; it is a floor. Students stay when the platform gives them something they cannot get from a group chat or a chatbot: the felt sense of getting better, made visible. The retention design, to be built through the phases in section 8, rests on a few honest mechanics rather than manipulative ones.

Progress that reflects mastery, not activity. A student's history shows concepts moving from shaky to solid based on how they performed across variants and how well they defended their reasoning, not on streak-counting or time logged. The algorithm behind those labels (evidence sources and their weights, the forgetting curve, promotion criteria, and the transparency contract that lets every label explain itself) is fully specified in the companion mastery model specification, and the frontend requirement it imposes is strict: never render a bare label in the student's own view; every label expands into its plain-language evidence trail. The satisfying signal is "I can now reliably do the thing", surfaced as a genuine picture of growth across the concepts a course covers. We deliberately avoid dark-pattern streaks, guilt notifications, and infinite-scroll mechanics; the audience is adults doing serious work, and treating them that way is itself the differentiator.

The variant well never runs dry. Because every case study is parameterized, a student who wants to drill a weak concept gets an endless supply of fresh, verified problems targeting it, each different enough to demand real thinking rather than memorized steps. "I have another one exactly like the one I just got wrong, but not identical" is a genuinely new capability, and it is the practical reason a student returns: this is the only place the practice never repeats and always matches where they actually are.

Effort is legible to the person who matters. Because attempts are handwritten, timestamped, and defended, a student accumulates a real, honest record of engaged work. That record is theirs, and it is also what their professor sees, so the effort a diligent student puts in is finally visible rather than invisible. For the student who actually does the work, that legibility is a reason to choose the platform where it counts.

Calm as a feature. Every competing surface a student uses at 11pm is engineered to agitate and retain through anxiety. Tirocinium's restraint (see the design direction in section 3) is a deliberate counter-position: a quiet, focused place to think, that ends the session when the work is done instead of manufacturing reasons to stay. Ending cleanly is the ethical choice and, with this audience, the stickier one.

### 4.3 Professor: authoring

Authoring has two doors: write from scratch, or import from PDF. Both end in the same editor.

**Import from PDF.** The professor drops in a PDF of problems with solutions and gets a processing view with honest per-stage status ("Reading pages 1 to 42", "Finding questions and solutions", "Extracting figures"). When extraction is ready, the confirmation surface is the heart of the flow: each detected problem is a card with the original PDF pages on the left and the extracted question and solution as editable typeset markdown on the right, figures rendered inline at their extracted positions so the reconstruction is judged as a whole, with per-item confidence shown quietly and low-confidence items sorted to the top. Actions per card are confirm, edit then confirm, merge with the next item (for a question the extractor split), split, and discard, all keyboard-driven with the same j/k model as the review queue. Figures get their own quiet verb set on hover: adjust the crop with drag handles (live re-crop from the lossless source), reassign to another item, mark decorative, or draw a box on the source page to capture a figure the detectors missed. A progress line ("14 of 22 confirmed") keeps the session's shape visible. Nothing enters the course until confirmed, and the interface says so plainly: "Confirmed problems become drafts in your course. The rest are discarded after 30 days." This screen is where professors decide whether Tirocinium respects their material, and diagrams are where that trust is won or lost: a professor who sees their circuit schematic reproduced pixel-perfect in place believes the platform; one who sees it mangled or missing never uploads again.

**The editor.** A two-pane editor: markdown source with live typeset preview. Parameterization is progressive disclosure with two speeds:

- *Manual*: the professor selects a value in the preview and marks it as a parameter, which inserts the token in the source and adds a typed entry (range, choices, step) to the parameter panel. Invariants are plain-language text fields with helper examples.
- *Auto-parameterize*: one action sends the problem and solution for analysis and returns a complete proposed spec. The proposal renders as an overlay on the preview, every proposed parameter highlighted in place in the text with its range in a marginal chip, and the drafted invariants listed with a one-line rationale each ("Keeps the NPV positive so the decision flips only when you intend it to"). Values frozen because they appear inside a figure are shown too, marked with a small lock and the reason ("4.7 kΩ appears in Figure 2"), each offering the two honest outs: mark the figure decorative, or move the value into the prose. The professor accepts all, accepts and edits, or dismisses. Accepted proposals land in the same panel as manual parameters, visually identical from then on; provenance appears only in a small "AI-proposed, edited by you" note until first save.

"Generate preview variants" renders three sample variants side by side before publishing, which is the moment professors build trust in the feature, and it works identically whether the spec was hand-written or proposed.

### 4.4 Professor: review

The review queue shows flagged variants (verification disagreement) with both solutions diffed, and submission review shows scan and transcription side by side with confidence highlighting and region hover-linking between the image and the text. Density is welcome here: keyboard navigation (j/k through queue, a/e to approve or edit) is a launch requirement, not a later refinement.

## 5. Performance budgets

Enforced in CI with Lighthouse CI on the four key routes (landing, course home, problem view, upload):

- LCP under 1.8 s on simulated mid-range mobile; the particle canvas must not be the LCP element and must not delay it.
- Initial JS under 170 kB gzipped on content routes; the particle component, editors, and KaTeX load in their own chunks on demand.
- INP under 200 ms; long tasks over 100 ms fail the check.
- Images through `next/image` exclusively; scan thumbnails served as pre-generated renditions from the backend, never full-resolution originals in lists.

## 6. Accessibility and quality floor

WCAG 2.2 AA is the floor: full keyboard operability including the upload flow, visible focus states designed as part of the visual language rather than default rings, correct announcements of processing state changes via live regions, contrast verified for both themes, and reduced-motion behavior covered in section 3.3. Axe checks run in CI; a manual screen-reader pass (VoiceOver and NVDA) is part of the definition of done for each of the four key surfaces.

## 7. Engineering conventions

- **Structure**: route groups `(student)`, `(professor)`, `(marketing)`; shared primitives in `components/ui`; feature components co-located with their route. No component reaches into another feature's directory.
- **Types**: the generated API types are the single source of truth; no hand-written interfaces for server data. `zod` only at genuinely untyped boundaries (file metadata, URL params).
- **Testing**: Playwright for the four critical journeys (practice loop, upload happy path, upload failure path, authoring and publish), including a mobile-viewport upload run; Vitest and Testing Library for interactive components; visual regression snapshots for the design primitives.
- **Review discipline**: any PR adding a client component states why it cannot be a server component. Any PR adding a dependency states the bundle cost. The particle shader has an owner; nobody else edits it casually.

## 8. Build order

1. Token system, primitives, app shell, professor sign-in, seat-code entry flow.
2. Student reading surfaces: course home, problem view with math rendering.
3. Upload flow end to end on desktop, then hardened on mobile devices.
4. Processing and transcription review states, then the voice defense conversation.
5. Professor authoring: editor with manual parameterization, then PDF import confirmation flow, then auto-parameterize proposals and preview variants.
6. Review queue with keyboard model and mastery-based student history, then the particle hero last, once budgets are green everywhere else.

The particle field ships last on purpose. It is the bow on the product, and a bow goes on a finished package.
