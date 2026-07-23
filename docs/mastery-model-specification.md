# Tirocinium Mastery Model Specification
## How a concept moves from shaky to solid

Version 0.2 draft, amended after the reference implementation (see revision note in 4.3). Companion to the backend and frontend development guides (v0.5) and implemented in the tirocinium-mastery Rust crate, whose property and scenario tests are the executable form of sections 8 and 10. This document specifies the algorithm behind the mastery picture described in frontend section 4.2b, precisely enough to implement, test, and audit. Nothing here should be built from vibes; every number below is a named parameter with a default and a rationale, and the model is deliberately simple enough that a professor could have it explained to them in five minutes and believe it.

---

## 1. Design principles

Four commitments shape every decision below.

**Mastery is a claim about now, not a trophy.** Knowing something in week 3 does not mean knowing it in week 12. The model therefore separates *how well the student demonstrated the concept* from *how recently and how durably*, and the label a student sees always reflects both. This is what makes the resurfacing loop ("this concept is worth revisiting") honest rather than nagging.

**Evidence has provenance, and provenance has weight.** A professor's grade, an automatic final-answer match, an AI reading of handwritten working, and a defense conversation are not equally trustworthy, and the model never pretends they are. Every update is an evidence event with a source, a weight, and a confidence, and low-trust evidence can nudge the estimate but never establish "solid" on its own.

**The model must be ungameable by grinding and unhurtable by bad OCR.** Re-solving the same variant five times in an hour should earn almost nothing. A blurry scan that transcribed badly should not damage a student's standing. Both properties are built in, not patched on.

**Transparent to the student, always.** Every label can be expanded into the plain-language evidence trail that produced it ("Solid because: correct on three variants across two weeks, defended the reasoning on Feb 12"). If the model cannot explain a state in one sentence of evidence, the state is wrong.

## 2. The concept model

Concepts are the unit of mastery, and they come from professors, assisted by AI, never invented silently by the system.

A course has a flat list of concepts (target: 8 to 25 per course; the interface discourages more, because a mastery picture over 60 micro-concepts is noise). Each concept is a short professor-owned name and one-line description ("Discounted cash flow: translating future cashflows into present value").

Each case study maps to one or more concepts with a weight in (0, 1] indicating how centrally the case exercises that concept. Weights are independent, not normalized: a case can be weight 1.0 on its core concept and 0.3 on a secondary one. During authoring (and during PDF import confirmation), the AI proposes the concept mapping alongside the parameter spec, using the course's existing concept list first and proposing a new concept only when nothing fits; the professor confirms or edits, under the same propose-and-dispose rule as everything else. Variants inherit their case study's concept mapping unchanged, since invariants guarantee pedagogical equivalence.

Storage (per course shard):

```sql
CREATE TABLE concepts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL          -- professor's ordering for display
);

CREATE TABLE case_study_concepts (
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id),
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (case_study_id, concept_id)
);
```

## 3. The evidence model

Every signal about a student's grasp of a concept enters the system as an immutable evidence event. Nothing updates mastery except through this table, which is what makes the model auditable.

```sql
CREATE TABLE evidence_events (
  id INTEGER PRIMARY KEY,
  seat_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES concepts(id),
  source TEXT NOT NULL,        -- see source table below
  score REAL NOT NULL,         -- e in [0,1], quality of the demonstration
  confidence REAL NOT NULL,    -- c in [0,1], how much we trust this reading
  ref_kind TEXT NOT NULL,      -- 'submission' | 'conversation' | 'grade'
  ref_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

The four sources, their weights, and where their numbers come from:

**professor_grade (weight 1.00).** A professor grading or explicitly marking a submission is ground truth. Score maps from the grade; confidence is 1.0. A professor event on a submission supersedes the automatic events derived from that same submission: their contribution is retracted from the estimate and the professor's event applied in their place (implemented as recomputation from the event log, see section 4.6).

**answer_match (weight 0.75).** The tolerant numeric comparer (backend 6.3) checks the final answer(s) in the student's transcription against the variant's stored solution. Score is 1.0 for a match within tolerance, 0.0 for a clear mismatch, and the event is simply not emitted when no comparable final answer exists (essay-style cases). Confidence equals the transcription confidence of the region containing the answer, floored at 0: a smudged final line produces a weak event, not a wrong one.

**working_assessment (weight 0.45).** An AI pass reads the full transcription against the reference solution and scores the soundness of the method per mapped concept on a four-point anchored rubric (0 wrong approach, 1 right idea with major errors, 2 sound with minor slips, 3 fully sound), normalized to [0,1]. Confidence is the product of overall transcription confidence and the model's own stated confidence. This is the richest signal but the least trustworthy one, which is exactly what its low weight encodes.

**defense_rubric (weight 0.60).** At the end of a voice defense conversation the tutor emits a structured verdict, never free text, scored on the same anchored 0 to 3 scale per concept actually discussed, with the named gap:

```json
{
  "concepts": [
    {"concept_id": 7, "reasoning": 2, "gap": "Confused nominal and real rates when asked to vary inflation"}
  ],
  "concept_to_revisit": 7,
  "session_confidence": 0.9
}
```

Confidence is session_confidence (the tutor's own calibration, low when the student barely engaged or audio was poor). The rubric prompt uses fixed behavioral anchors ("a 3 requires the student to have stated *why* the step follows, unprompted or with at most one prompt") specifically to resist drift toward generosity, and section 10 audits it against professor grades.

One submission or conversation produces one event per mapped concept, with the case's concept weight folded into the update step (section 4.3), not into the stored event, so the event log stays a clean record of what was observed.

## 4. The algorithm

Per (seat, concept) the system maintains three numbers:

- **m** in [0, 1]: the mastery estimate, the model's belief in how well the student can execute the concept when fresh.
- **s** in days: stability, how slowly that ability fades without practice.
- **t_last**: timestamp of the last evidence event.

### 4.1 Retention and effective mastery

Between events, ability fades along a forgetting curve. Retention after a gap of Δt days is

    r = 2^(−Δt / s)

so s is a half-life: a concept with s = 14 retains half its edge after two weeks untouched. What the student sees, and what labels are computed from, is effective mastery:

    m_eff = m × r

A student who reached m = 0.9 with s = 4 and then did nothing for three weeks has m_eff ≈ 0.02 above baseline of what fresh evidence would show, and the model says so, gently, by moving the label back and surfacing the concept for revisiting. Nothing about m itself is destroyed by time; a single successful return restores the picture quickly (see 4.4), which matches how relearning actually behaves.

### 4.2 Initialization

First evidence event for a (seat, concept): m starts at m₀ = 0.3 (the prior that a first attempt in a course context reflects partial familiarity, not zero), s starts at s₀ = 2 days, then the event is applied normally. No state exists before evidence; the label is "unseen".

### 4.3 The update step

On an evidence event with score e, source weight w, confidence c, arriving for a concept the case maps with weight k, at gap Δt since t_last:

The stored m is the *fresh-ability estimate* and is not decayed by the passage of time; decay lives entirely in m_eff (4.1). Evidence therefore updates m directly. (Revision note: v0.1 of this specification decayed m to the present before each update. The reference implementation showed that rule contradicts 4.1's relearning philosophy and, worse, caps m near 0.5 under expanding-interval practice, making solid unreachable on the revisit queue's own rhythm, because well-spaced gaps destroyed more estimate than one event's learning rate could restore. The v0.2 rule fixes both: a successful return after a long gap restores the visible picture immediately, and the optimal practice schedule is also the fastest route to solid, as it should be.)

Compute the effective learning rate:

    α = α_base × w × c × k × d(n)

with α_base = 0.35, and d(n) the massed-practice damper: n counts prior evidence events for this (seat, concept) within the past 18 hours, and d(n) = 1 / (1 + n). The first attempt today moves the estimate at full strength, the second at half, the third at a third. Grinding the same concept in one sitting converges to nothing, which is both the anti-gaming property and the honest reading of the spacing literature: massed repetition demonstrates little beyond the first success.

Then update:

    m ← m + α × (e − m)

clamped to [0, 1]. This is a confidence- and provenance-weighted exponential estimator: simple, monotone in the evidence, and explainable ("each demonstration pulls the estimate toward how well it went, stronger when the evidence is trustworthy"). Failures lower m directly through the same rule, so a student who has genuinely lost the thread sees the fresh-ability estimate fall too, not just the retention factor.

### 4.4 The stability update

Stability grows only through *spaced success*, which is the mechanism that makes "solid" mean durable rather than crammed.

On a successful event (e ≥ 0.7 and c ≥ 0.4), let ρ = min(Δt / s, 2), the gap expressed as a fraction of the current half-life, capped:

    s ← s × (1 + g × ρ × c),  g = 0.9

A success after a full half-life roughly doubles stability; a success ten minutes after the last one (ρ ≈ 0) leaves it untouched. On a clear failure (e ≤ 0.3 and c ≥ 0.4):

    s ← max(s_min, s × 0.6),  s_min = 1 day

Failure shrinks the half-life but never below a floor: forgetting a concept faster after failing it is realistic, and the shortened half-life is what pulls the concept back into the revisit queue sooner. Middling or low-confidence events leave s unchanged. Stability is capped at s_max = 90 days; beyond a term's horizon the claim has no meaning.

### 4.5 Labels and hysteresis

Labels are computed from m_eff and the evidence history, with promotion criteria stricter than demotion criteria so the display never flaps:

- **Unseen**: no evidence events.
- **Shaky**: m_eff < 0.40.
- **Developing**: m_eff ≥ 0.40.
- **Solid**, all of: m_eff ≥ 0.75; s ≥ 7 days; at least three evidence events on the concept; at least two successes (e ≥ 0.7, c ≥ 0.4) separated by 72 hours or more; and at least one success from a high-trust source (professor_grade, answer_match with c ≥ 0.7, or defense_rubric with e ≥ 0.67).

The high-trust requirement deliberately does not mandate the defense conversation, which is opt-in by design (frontend 4.2): a student can reach solid through consistently correct, well-scanned work alone. The defense is a faster and richer route, not a toll gate.

Hysteresis: once earned, a label is only demoted when m_eff falls 0.05 below its threshold (solid demotes below 0.70, developing below 0.35), so a student hovering at a boundary sees a stable picture, not a coin flip. The one-line explanation attached to every label (section 9) always names decay explicitly when decay is the reason ("Solid is slipping because it has been three weeks; one fresh variant will tell us where you stand").

### 4.6 Recomputation, not mutation

The (m, s) state is a cache. The source of truth is the evidence_events log, and the full state for a (seat, concept) is recomputable by replaying events in order, which is how professor overrides supersede automatic events (mark the superseded events, replay), how parameter tuning is evaluated against history (section 10), and how bugs get fixed retroactively. Replay of one seat-concept stream is microseconds of arithmetic; a full course shard replays in well under a second inside the Rust crate, where this whole computation lives (`platform_core::mastery`), exposed to Python as pure functions of (event stream, parameter set) → state. Purity here is what makes the model testable to the standard the rest of the platform holds.

## 5. Resurfacing: the revisit queue

The forgetting curve powers the platform's one proactive gesture. A concept enters the revisit queue when its retention r drops below 0.70 while m ≥ 0.5 (there is something worth retaining) and its label is not shaky (shaky concepts are surfaced through the gap-targeting loop after defenses instead, since what they need is teaching, not maintenance). The queue is presented calmly in course home ("Two concepts are worth a fresh look"), each offering one targeted variant; it never notifies off-platform by default, in keeping with the no-nagging position of frontend 4.2b. Completing a revisit variant is just evidence like any other, and by 4.4 a spaced success here is exactly what grows stability most, so the loop and the model reinforce each other: the platform asks for practice precisely when practice is worth the most.

Concept targeting for "one fresh variant on this concept" selects among published case studies by mapping weight for the concept (highest first), excluding cases the student attempted within 48 hours, then draws an unattempted verified variant from the pool.

## 6. What the professor sees

The professor's view is the same model aggregated with restraint: per concept, the distribution of seat labels (how many unseen, shaky, developing, solid) and the most common defense-named gaps verbatim, which turns the tutor's structured verdicts into a live map of class-wide misconceptions ("11 seats show the nominal-versus-real confusion on concept 7"). No per-seat ranking view exists, by design; the professor can open an individual seat's history, but the default lens is the class's relationship to the material, not a leaderboard of people.

## 7. Parameters

Every constant above, in one place, stored in the directory database as the active parameter set with a version id (evidence replays reference the version they were computed under):

| Parameter | Default | Meaning |
|---|---|---|
| m₀ | 0.30 | prior mastery at first evidence |
| s₀ | 2 d | initial half-life |
| α_base | 0.35 | base learning rate |
| w: professor_grade | 1.00 | source weight |
| w: answer_match | 0.75 | source weight |
| w: defense_rubric | 0.60 | source weight |
| w: working_assessment | 0.45 | source weight |
| success threshold | e ≥ 0.7, c ≥ 0.4 | counts as a demonstrated success |
| failure threshold | e ≤ 0.3, c ≥ 0.4 | counts as a clear failure |
| g | 0.9 | stability growth factor |
| failure shrink | 0.6 | stability multiplier on failure |
| s_min / s_max | 1 d / 90 d | stability bounds |
| massed window | 18 h | window for the damper count |
| solid: m_eff / s / events / spacing | 0.75 / 7 d / 3 / 72 h | promotion criteria |
| developing: m_eff | 0.40 | promotion criterion |
| hysteresis | 0.05 | demotion margin below threshold |
| revisit trigger | r < 0.70, m ≥ 0.5 | queue entry condition |

These defaults are principled guesses, stated as such. Section 10 is how they stop being guesses.

## 8. Anti-gaming, restated as properties

The design choices above compose into guarantees worth naming. Grinding one variant repeatedly earns vanishing credit (massed damper) and can never reach solid (spacing requirement). Solid cannot be reached through low-trust evidence alone (high-trust requirement), so a student cannot talk a generous transcription model into a label. Bad scans cannot hurt: every automatic pathway multiplies by transcription confidence, so illegible work produces weak evidence, not negative evidence, and the interface's existing "page 3 is too blurry" rejection catches the worst before it becomes evidence at all. And because professors supersede everything, any residual model error is correctable by the person whose judgment the label ultimately borrows its authority from.

## 9. Transparency contract

Every label rendered anywhere resolves, on tap, to its evidence: the last five events in plain language with dates and sources ("Correct final answer, Feb 3" / "Defended the reasoning well, one gap on rate conversion, Feb 12" / "Fading: last practiced 19 days ago"). The API returns this trail with the state; the frontend never shows a bare label in the student's own view. The parameters page of the professor's course settings links to a rendered one-page explanation of this model, because a mastery claim a professor cannot inspect is a mastery claim they will not trust, and their trust is the product.

## 10. Validation plan

The model earns its parameters in three stages. First, unit properties in the Rust crate: monotonicity (better evidence never lowers m), the anti-gaming guarantees of section 8 as property tests, and replay determinism. Second, calibration against professors: on every course where grading happens, compare label at grading time against grade received; "solid" should predict strong performance and the defense rubric's agreement with professor judgment is tracked per course, with the rubric prompt revised when correlation drifts. Third, parameter fitting by replay: because state is a pure function of the event log and a parameter set, candidate parameter sets are evaluated offline against accumulated real logs for calibration error, with no experiments run on students. Changes ship as a new parameter version, with full replay, and the version history is part of the audit trail.

## 11. Open questions, honestly held

Three things this version does not resolve. Concept granularity is professor-defined, and two professors will slice the same syllabus differently; the model is agnostic, but cross-course analytics will not be comparable, and that is accepted for now. Partial credit inside a multi-part case (right method, arithmetic slip in part b) currently arrives only through working_assessment's rubric; whether parts deserve their own concept mappings is deferred until real course data shows the need. And the defense rubric's resistance to drift is asserted through anchoring and audited through section 10, but a model update at the provider could shift its calibration overnight; the mitigation is the per-course agreement tracking plus pinned model versions for the rubric call, and this is the single component to watch most closely in the first term.
