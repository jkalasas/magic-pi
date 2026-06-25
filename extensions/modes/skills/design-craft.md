---
name: design-craft
description: Detailed frontend craft reference for DESIGNER mode — color, typography, layout, motion, interaction, and the critique framework (Nielsen heuristics, cognitive load, personas). Read when doing the build or critique pass.
---

# Design Craft Reference

Detailed reference for DESIGNER mode. Read this when you start the build pass or
the critique pass — not every turn. The mode body carries the discipline; this
file carries the specifics.

## Color

### OKLCH, always
Use OKLCH for every color. It is perceptually uniform, so ramp steps look even
and contrast math is honest. RGB/HSL steps lie.

### Contrast (non-negotiable)
- Body text: ≥4.5:1 against its background.
- Large text (≥18px, or bold ≥14px): ≥3:1.
- Placeholder text: ≥4.5:1 — the muted-gray default fails this and is the single
  biggest reason AI designs feel hard to read.
- If contrast is even close, bump body color toward the ink end of the ramp.
  Light gray "for elegance" is a tell.

### Gray on color
Gray text on a colored background looks washed out. Use a darker shade of the
background's own hue, or a transparency of the text color. Never neutral gray
on a saturated field.

### Tinted neutrals
Add 0.005–0.015 chroma toward the brand's hue. Do not default-tint toward warm
or cool "because the brand feels that way" — that is the cross-project
monoculture move. Tint toward the brand's own hue, or use chroma 0 for a true
off-white.

### The cream/sand tell
The whole warm-neutral band (OKLCH L 0.84–0.97, C < 0.06, hue 40–100) reads as
cream/sand/paper/parchment regardless of what you call it. Token names like
`--paper`, `--cream`, `--sand`, `--bone`, `--linen`, `--parchment` are tells in
themselves. This is the saturated AI default. "Warm, editorial, traditional"
does NOT mean a near-white warm-tinted body bg. Warmth is carried by accent +
typography + imagery, not by body bg. Pick instead: (a) a saturated brand color
as the body, (b) a true off-white at chroma 0, (c) a darker mid-tone tinted
neutral that is clearly the brand's own.

### Dark vs. light is never a default
Write one sentence of physical scene first: who uses this, where, under what
ambient light, in what mood. If the sentence doesn't force the answer, it's not
concrete enough. Add detail until it does. Not dark "because tools look cool
dark." Not light "to be safe."

### Color strategy (pick before picking colors)
- **Restrained** — tinted neutrals + one accent ≤10%. Product default; brand
  minimalism.
- **Committed** — one saturated color carries 30–60% of the surface. Brand
  default for identity-driven pages.
- **Full palette** — 3–4 named roles, each used deliberately. Brand campaigns;
  product data viz.
- **Drenched** — the surface IS the color. Brand heroes, campaign pages.

## Typography

### Font selection procedure (every project, never skip)
1. Write three concrete brand-voice words. Not "modern" or "elegant" — physical
   words: "warm and mechanical and opinionated", "calm and clinical and careful".
2. List the three fonts you'd reach for by reflex. If any are on the reject list
   below, reject them; they are training-data defaults that create monoculture.
3. Browse a real catalog (Google Fonts, Pangram Pangram, Future Fonts, Adobe
   Fonts, ABC Dinamo, Klim, Velvetyne) with the three words in mind. Find the
   font as a *physical object*: a museum caption, a 1970s terminal manual, a
   fabric label, a cheap-newsprint children's book, a concert poster, a diner
   receipt. Reject the first thing that "looks designy."
4. Cross-check. "Elegant" is not necessarily serif. "Technical" is not
   necessarily sans. "Warm" is not Fraunces. If the final pick lines up with the
   original reflex, start over.

### Reflex-reject list (training-data defaults — look further)
Fraunces · Newsreader · Lora · Crimson (all variants) · Playfair Display ·
Cormorant (all variants) · Syne · IBM Plex (Mono/Sans/Serif) · Space Mono ·
Space Grotesk · Inter · DM Sans · DM Serif (Display/Text) · Outfit · Plus
Jakarta Sans · Instrument (Sans/Serif)

These apply to **new** design choices. When the existing brand has already
committed to a font as identity, identity-preservation wins; don't second-guess
what's already shipping.

### Pairing
Don't pair fonts that are similar but not identical (two geometric sans, two
humanist sans). Pair on a contrast axis (serif + sans, geometric + humanist) or
use one family in multiple weights. A single well-chosen family with committed
weight/size contrast beats a timid display+body pair.

### Scale and measure
- Modular scale, fluid `clamp()` for headings, ≥1.25 ratio between steps. Flat
  scales (1.1× apart) read as uncommitted.
- Cap body line length at 65–75ch.
- Display heading ceiling: `clamp()` max ≤ 6rem (~96px). Above that the page is
  shouting.
- Display heading letter-spacing floor: ≥ -0.04em. Tighter and letters touch.
- `text-wrap: balance` on h1–h3 for even line lengths; `text-wrap: pretty` on
  long prose to reduce orphans.
- Light text on dark backgrounds: add 0.05–0.1 to line-height. Light type reads
  as lighter weight and needs more breathing room.

## Layout

- Vary spacing for rhythm. Generous separations, tight groupings — not a uniform
  24px everywhere.
- Cards are the lazy answer. Use them only when they're truly the best
  affordance. Nested cards are always wrong.
- Flexbox for 1D, Grid for 2D. Don't default to Grid when `flex-wrap` would be
  simpler.
- Responsive grids without breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- Build a semantic z-index scale (dropdown → sticky → modal-backdrop → modal →
  toast → tooltip). Never arbitrary values like 999 or 9999.
- Optical alignment: adjust for visual weight. Icons often need an offset to
  read as centered next to text.

## Motion

- Motion is intentional, not an afterthought. Consider it part of the build.
- Don't animate CSS layout properties unless truly needed. Animate transform and
  opacity.
- Ease out with exponential curves (ease-out-quart / quint / expo). No bounce,
  no elastic — they feel dated.
- Use libraries for advanced motion (motion, gsap, anime.js, lenis).
- Reduced motion is not optional. Every animation needs a
  `@media (prefers-reduced-motion: reduce)` alternative: typically a crossfade
  or instant transition.
- Reveal animations must enhance an already-visible default. Never gate content
  visibility on a class-triggered transition; transitions pause on hidden tabs
  and headless renderers, so the reveal never fires and the section ships blank.
- Premium motion materials are not just transform/opacity. Blur, backdrop-filter,
  clip-path, mask, and shadow/glow are part of the palette when they materially
  improve the effect and stay smooth. Bound expensive paint areas.

## Interaction

- Dropdowns rendered with `position: absolute` inside an `overflow: hidden` or
  `overflow: auto` container will be clipped. Use the native `<dialog>` / popover
  API, `position: fixed`, or a portal to escape the stacking context.
- Touch targets ≥44×44px on touch devices.
- Every interaction has a keyboard path. No hover-only functionality.
- Never remove focus indicators without a replacement.

## Critique framework

Use this when the user asks DESIGNER mode to critique or review (not build).

### Nielsen heuristics quick-scan
Score each 0–4. Be honest: 4 means genuinely excellent. Most real interfaces
score 20–32 out of 40.

1. **Visibility of system status** — feedback for every action; progress
   visible; current location clear.
2. **Match system and real world** — user's language, no unexplained jargon,
   natural information order.
3. **User control and freedom** — undo, cancel, clear escape routes.
4. **Consistency and standards** — same things called same names, same actions
   behave the same, platform conventions followed.
5. **Error prevention** — confirmation before destructive actions, constraints
   on invalid input, smart defaults.
6. **Recognition over recall** — options visible, icons labeled, context kept
   on screen.
7. **Flexibility and efficiency** — keyboard shortcuts, accelerators, bulk
   actions that don't burden novices.
8. **Aesthetic and minimalist design** — every element earns its pixel; clear
   hierarchy; no decorative clutter.
9. **Error recovery** — plain-language messages, specific problem ID,
   actionable fix, preserves user work.
10. **Help and documentation** — easy to find, task-focused, contextual.

Rating bands: 36–40 excellent · 28–35 good · 20–27 acceptable · 12–19 poor ·
0–11 critical.

### Cognitive load checklist
- [ ] Single focus — primary task completable without competing elements.
- [ ] Chunking — info in digestible groups (≤4 per group).
- [ ] Grouping — related items visually grouped (proximity, borders, background).
- [ ] Visual hierarchy — immediately clear what's most important.
- [ ] One thing at a time — a single decision before the next.
- [ ] Minimal choices — ≤4 visible options at any decision point.
- [ ] Working memory — user need not remember info from a previous screen.
- [ ] Progressive disclosure — complexity revealed only when needed.

0–1 failures = low load. 2–3 = moderate. 4+ = critical.

The working-memory rule: humans hold ≤4 items at once. At any decision point, ≤4
options is manageable, 5–7 is pushing it, 8+ is overloaded. Navigation ≤5
top-level items. Forms ≤4 fields per group. Actions: 1 primary, 1–2 secondary,
rest in a menu. Pricing ≤3 tiers.

### Personas
Pick 2–3 relevant to the interface type. Walk the primary action as each. Report
specific red flags — named elements and interactions that fail — not generic
descriptions.

- **Alex — impatient power user.** Skips onboarding, hunts shortcuts, tries
  bulk/automation, abandons if anything feels slow or patronizing. Red flags:
  forced tutorials, no keyboard nav, unskippable animations, one-at-a-time where
  batch is natural.
- **Jordan — confused first-timer.** Reads all instructions, hesitates on the
  unfamiliar, hunts for help, takes labels literally. Red flags: icon-only nav,
  unexplained jargon, no visible help, ambiguous next steps, no success
  confirmation.
- **Sam — accessibility-dependent.** Screen reader + keyboard only, may have low
  vision. Red flags: click-only interactions, missing/invisible focus, meaning
  by color alone, unlabeled fields, time-limited actions without extension.
- **Riley — deliberate stress tester.** Pushes edge cases: empty/1000 items,
  long strings, emoji, RTL, refresh mid-flow, multi-tab. Red flags: silent
  failures, broken error recovery, empty states with no guidance, data loss on
  refresh, inconsistent behavior between similar interactions.
- **Casey — distracted mobile user.** One-handed thumb, frequently interrupted,
  possibly slow connection. Red flags: important actions out of thumb zone, no
  state persistence, heavy required typing, no lazy loading, tiny tap targets.

Selection by interface type: landing/marketing → Jordan, Riley, Casey;
dashboard/admin → Alex, Sam; ecommerce/checkout → Casey, Riley, Jordan;
onboarding → Jordan, Casey; data-heavy/analytics → Alex, Sam; form/wizard →
Jordan, Sam, Casey.

### Severity
- **P0 Blocking** — prevents task completion. Fix immediately.
- **P1 Major** — significant difficulty/confusion. Fix before release.
- **P2 Minor** — annoyance with a workaround. Next pass.
- **P3 Polish** — nice-to-fix, no real user impact. If time permits.
