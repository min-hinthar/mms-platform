export const meta = {
  name: 'path-design-thinking',
  description: 'Map diner and staff paths, pick the moments that matter, diverge three concepts each, judge them',
  phases: [
    { title: 'Map', detail: 'six path mappers plus the visual system' },
    { title: 'Pick', detail: 'choose the eight moments that matter' },
    { title: 'Diverge', detail: 'three concepts per moment: Quiet, Guided, Glanceable' },
    { title: 'Judge', detail: 'score and recommend per moment' },
  ],
}

const REPO = '/home/user/mms-platform'
const LENS_PATH = args.lens // a design-lens brief in your scratchpad (the 2026-10-07 run used cards/lens-final.md)
const READ = `Repository: ${REPO} (Turborepo; the QR app is apps/qr). READ-ONLY: never edit, write, commit, run the app, mint sessions, or touch prod. Sources of truth for design: docs/DESIGN-LANGUAGE.md (as-built language: lit-gold selection cap, paper layer, motion idioms, optimistic doctrine, honesty, bilingual rules), docs/context/RUBRIC.md, docs/context/DESIGN-RESEARCH.md, docs/context/ORDER-MODEL.md, docs/PHASE3_JOURNEYS.md, docs/PHASE3B_DESIGN.md, docs/PHASE3C_DESIGN.md, docs/PHASE3C_II_DESIGN.md, docs/prototype/v7.2.html, docs/PILOT_PLAN.md, docs/OWNER_RULINGS_2026-10-07.md (the owner's rulings — binding), docs/OPEN-ITEMS.md (the open friction registry), and the family-business design lens at ${LENS_PATH}. Cite evidence as repo-relative file:line, OPEN-ITEMS ids, or doc sections. Quote on-screen copy EXACTLY from code (lib/i18n/*.ts, components). Never invent facts: hours, volume, headcount and table count are UNKNOWN.`

const STEP = {
  type: 'object',
  properties: {
    n: { type: 'integer' }, screen: { type: 'string' }, where: { type: 'string', description: 'route + component file:line' },
    what_they_see: { type: 'string' }, taps: { type: 'integer' }, copy_en: { type: 'array', items: { type: 'string' } },
    has_burmese: { type: 'boolean' }, states: { type: 'string', description: 'loading / empty / refused / error variants' },
  },
  required: ['n', 'screen', 'where', 'what_they_see'],
}
const JOURNEY = {
  type: 'object',
  properties: {
    path: { type: 'string' }, who: { type: 'string' }, device: { type: 'string' },
    steps: { type: 'array', items: STEP },
    total_taps_happy_path: { type: 'integer' },
    friction: { type: 'array', items: { type: 'object', properties: {
      where: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string' },
      who_feels_it: { type: 'string' }, severity: { type: 'string', enum: ['high', 'med', 'low'] },
      in_flight: { type: 'string', description: 'OPEN-ITEMS id / wave stream that already owns it, or none' },
    }, required: ['where', 'problem', 'evidence', 'severity'] } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'who', 'device', 'steps', 'friction', 'strengths'],
}
const VISUAL = {
  type: 'object',
  properties: {
    light: { type: 'object', description: 'token name → exact hex/rgba for the light (editorial) theme: ground, paper/surface, ink, ink-2, ink-3, accent, accent ink, gold cap, success, warn, danger, line/border, and any others the components use most' },
    night: { type: 'object', description: 'same keys for Night (dark)' },
    fonts: { type: 'object', description: 'display, body, Burmese families exactly as loaded (names + weights + where loaded) and Google Fonts availability' },
    type_scale: { type: 'string' }, spacing: { type: 'string' }, radii: { type: 'string' }, shadows: { type: 'string' },
    selection_vocabulary: { type: 'string', description: 'how the lit-gold cap looks exactly (css)' },
    buttons: { type: 'string', description: 'primary/secondary/quiet button css: bg, ink, radius, height, weight' },
    paper_texture: { type: 'string', description: 'lines on pages, dots on cards: exact css' },
    bilingual_pattern: { type: 'string', description: 'how EN + MY stack (sizes, order, spacing) on diner and staff surfaces' },
    staff_surfaces: { type: 'string', description: 'how staff tablet screens look: density, sizes, header, the KDS look' },
    brand: { type: 'string', description: 'name, voice, motifs from lib/brand.ts and the prototype' },
  },
  required: ['light', 'night', 'fonts', 'type_scale', 'radii', 'selection_vocabulary', 'buttons', 'bilingual_pattern', 'staff_surfaces'],
}
const MOMENTS = {
  type: 'object',
  properties: {
    moments: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string', description: 'm1..m8' }, title: { type: 'string' }, path: { type: 'string' },
      who: { type: 'string' }, device: { type: 'string', enum: ['phone', 'tablet', 'tv'] },
      today: { type: 'string', description: 'what happens now, step by step, with evidence' },
      why_it_matters: { type: 'string' }, success_looks_like: { type: 'string' },
      binding_rules: { type: 'string', description: 'owner rulings / doctrine / honesty-money rules this moment must respect' },
      in_flight: { type: 'string' },
    }, required: ['id', 'title', 'path', 'who', 'device', 'today', 'why_it_matters', 'success_looks_like', 'binding_rules'] } },
    left_out: { type: 'array', items: { type: 'string' }, description: 'strong candidates not picked, and why' },
  },
  required: ['moments', 'left_out'],
}
const CONCEPT = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'evocative 2-4 word name' }, angle: { type: 'string' }, one_liner: { type: 'string' },
    screens: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' },
      layout: { type: 'string', description: 'precise top-to-bottom regions with sizes in px for the device frame, element by element' },
      copy_en: { type: 'array', items: { type: 'string' } },
      copy_my: { type: 'array', items: { type: 'string' }, description: 'Burmese drafts for the key strings (flag as drafts)' },
      states: { type: 'string' }, interactions: { type: 'string' },
    }, required: ['title', 'layout', 'copy_en', 'states', 'interactions'] } },
    taps_before_after: { type: 'string' },
    why_for_this_family: { type: 'string' }, honesty_and_money: { type: 'string' },
    a11y: { type: 'string' }, risks: { type: 'string' }, code_touch: { type: 'string' }, effort: { type: 'string', enum: ['S', 'M', 'L'] },
  },
  required: ['name', 'angle', 'one_liner', 'screens', 'why_for_this_family', 'honesty_and_money', 'a11y', 'risks', 'code_touch', 'effort'],
}
const JUDGEMENT = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: {
      concept: { type: 'string' }, clarity_for_parents: { type: 'number' }, speed: { type: 'number' }, honesty: { type: 'number' },
      a11y: { type: 'number' }, feasibility: { type: 'number' }, delight: { type: 'number' }, total: { type: 'number' }, note: { type: 'string' },
    }, required: ['concept', 'total', 'note'] } },
    recommended: { type: 'string' }, grafts: { type: 'string', description: 'the best ideas to borrow from the other two' },
    reasoning: { type: 'string' }, owner_question: { type: 'string', description: 'one plain line the owner can answer by picking' },
  },
  required: ['scores', 'recommended', 'grafts', 'reasoning', 'owner_question'],
}

const PATHS = [
  { key: 'dinein', p: 'DINER DINE-IN: scan the table sticker → join or start the table → menu → add dishes (options sheet) → Send to kitchen (10 s undo grace) → pay (one bill; split is parked) → /track → receipt / goodbye. Include the group cart, invite sheet, DoorSheet, table chips, CartBar, Checkout.' },
  { key: 'togo', p: 'DINER TO-GO / PICKUP ONLINE: home → /menu?mode=pickup → cart → who (name, phone) and when (ASAP / slot) → pay → /track (pickup rail) → arriving at the counter to collect. Include rewards/account touchpoints on this path.' },
  { key: 'grocery', p: 'GROCERY SCAN-AND-GO: /grocery browse/search/scan (BarcodeScanner) → basket → checkout → exit pass. Include what happens when a barcode is not in the catalog.' },
  { key: 'counter', p: 'STAFF COUNTER / FLOOR on a shared tablet: PIN sign-in/lock → counter home (app/staff/page.tsx) floor board → a table page (app/staff/table/[id]) → order pad (OrderPad) → walk-up counter sale (register) → take cash / card (CashSettleButton, TerminalSettle) → clear table / merge → Help. Include the language switch and what Burmese-first parents see.' },
  { key: 'kitchen', p: 'KITCHEN & EXPO: KDS board (KdsBoard) tickets, start/bump/recall, sound/chime, 86 sold-out controls (MenuPriceEditor / menu-availability), expo lane (ExpoBoard), pickup wall TV (ReadyBoard, app/board). Include what the cook sees at distance and in a Night room.' },
  { key: 'manager', p: 'MANAGER / OWNER: approvals (ApprovalsBoard, manager PIN step-up), refunds console (SettledToday, RefundActionSheet, refunds-needed strip), team (TeamManager), tips/report (app/staff/tips), menu price editor, glossary. Include how a manager who also serves gets pulled into these.' },
]

phase('Map')
const [maps, visual] = await Promise.all([
  parallel(PATHS.map(p => () => agent(`${READ}

TASK: map this path exactly as BUILT today, from code, not from plans: ${p.p}
For each step: the screen, route + component file:line, what the person sees (hierarchy, primary action), taps to get through it on the happy path, the exact English copy on it, whether Burmese is shown, and the non-happy states. Then list friction with evidence (code, OPEN-ITEMS rows, measured docs) — who feels it and how badly — marking anything an in-flight wave stream or OPEN-ITEMS row already owns. Also list what genuinely works well (strengths to keep). Be concrete and exhaustive; this map is the ground truth the designers will work from.`, { label: `map:${p.key}`, phase: 'Map', schema: JOURNEY }))),
  agent(`${READ}

TASK: extract the app's ACTUAL visual system so prototypes can look exactly like the product. Read packages/ui/src/tokens.css, apps/qr/app/globals.css (the relevant parts), apps/qr/app/layout.tsx (fonts), packages/ui components (Button, Sheet, Toast, Chip), lib/brand.ts, docs/DESIGN-LANGUAGE.md, and docs/prototype/v7.2.html. Report exact token values for Light and Night, the fonts as loaded (families, weights, Burmese font) and whether each is on Google Fonts, type scale, spacing, radii, shadows (the two-tier --sh-paper), the lit-gold selection cap's exact CSS, button styles, the paper texture (lines on pages, dots on cards), how English and Burmese stack on diner vs staff screens, how staff tablet screens and the KDS look (density, sizes), and the brand voice/motifs.`, { label: 'visual-system', phase: 'Map', schema: VISUAL }),
])
const mapsOk = maps.filter(Boolean)
log(`mapped ${mapsOk.length}/6 paths; visual system ${visual ? 'extracted' : 'MISSING'}`)

phase('Pick')
const picked = await agent(`${READ}

You are the lead designer. Below are six maps of the product's real paths (diner and staff), built from code. Pick the EIGHT "moments that matter" — the points where a better design would most change how this small family business runs and how its guests feel. Balance: at least three diner moments and at least three staff moments (counter, kitchen or manager), at least one on a shared tablet used by Burmese-first parents. Prefer moments with real, evidenced friction or high frequency; prefer work that is NOT a pure backend fix. A moment already owned by a wave stream is still eligible when its UX is unsettled — say who owns it. For each: what happens today (with evidence), why it matters for THIS family, what success looks like (measurable where possible), and the binding rules it must respect (owner rulings, money/honesty doctrine, bilingual rules). Also list strong candidates you left out and why.

MAPS:
${JSON.stringify(mapsOk)}`, { label: 'pick-moments', phase: 'Pick', schema: MOMENTS })

const moments = (picked?.moments ?? []).slice(0, 8)
log(`picked ${moments.length} moments: ${moments.map(m => m.id + ' ' + m.title).join(' · ')}`)

const ANGLES = [
  { key: 'quiet', a: 'QUIET — subtract. One obvious action per screen, calm hierarchy, the fewest elements and words that still say everything true. Think: what would we remove?' },
  { key: 'guided', a: 'GUIDED — the screen speaks. One question at a time, plain words in both languages, a visible "where am I / what next", forgiving undo. Think: a kind family member standing beside you.' },
  { key: 'glanceable', a: 'GLANCEABLE — bold and spatial. Big type, state you can read from across the room or at arm’s length, color AND shape coding (never color alone), gestures where they save taps. Think: a busy Friday night.' },
]

phase('Diverge')
const results = await pipeline(
  moments,
  (m) => parallel(ANGLES.map(an => () => agent(`${READ}

Design ONE concept for this moment, from the ${an.a} angle.

MOMENT: ${JSON.stringify(m)}

THE PRODUCT'S VISUAL SYSTEM (use it; the concept must look like this app, not a generic one): ${JSON.stringify(visual)}

Rules: obey the owner's rulings and the family-business lens (read ${LENS_PATH}); amounts are never optimistic; every refusal says what happened and one way out; English plus a Burmese draft for every new sentence (diners: English leading; staff: per-device language); touch targets ≥44px; never color alone; reduced-motion off-switch; no invented hours/stats. Describe screens precisely enough that a designer can draw them pixel-for-pixel in a ${m.device === 'phone' ? '390×844 phone' : m.device === 'tv' ? '1920×1080 TV' : '1366×1024 tablet'} frame: regions top to bottom with sizes, exact copy, states, interactions. Be genuinely creative inside the constraints — a concept that only restyles today's screen is a failure.`, { label: `concept:${m.id}:${an.key}`, phase: 'Diverge', schema: CONCEPT }).then(c => c && ({ ...c, angle_key: an.key })))),
  (concepts, m) => agent(`${READ}

Judge three concepts for this moment, as a panel of: a Burmese-first parent working the counter on a busy night, a first-time diner on their phone, and the owner who pays for every refund. Score each 1-5 on clarity for the parents, speed (taps/seconds), honesty (money and refusal truth), accessibility, feasibility in THIS codebase and design language, and delight; total = sum. Recommend one, name the ideas worth grafting from the others, and write ONE plain question the owner can answer by picking.

MOMENT: ${JSON.stringify(m)}
CONCEPTS: ${JSON.stringify((concepts || []).filter(Boolean))}`, { label: `judge:${m.id}`, phase: 'Judge', schema: JUDGEMENT })
    .then(j => ({ moment: m, concepts: (concepts || []).filter(Boolean), judgement: j })),
)

return { visual, maps: mapsOk, picked, results: results.filter(Boolean) }
