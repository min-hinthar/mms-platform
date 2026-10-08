export const meta = {
  name: "refine-picked-paths",
  description:
    "Refine the owner-picked design per moment (synth spec, cross-moment consistency, adversarial critic, draw artboards)",
  phases: [
    {
      title: "Synthesize",
      detail:
        "one agent per moment: picked concept + grafts + owner answers -> refined spec, claims checked against code",
    },
    {
      title: "Consistency",
      detail:
        "one agent reads all 8 specs: one vocabulary across diner and across the four glanceable staff screens",
    },
    {
      title: "Critique",
      detail:
        "adversarial review of each amended spec against code, rules and owner answers",
    },
    {
      title: "Draw",
      detail: "one agent per moment draws the refined artboards",
    },
  ],
};

const A = args;
const BRIEF = A.brief;
const PROJ = A.proj;

const SYNTH_SCHEMA = {
  type: "object",
  properties: {
    spec_path: { type: "string" },
    screens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          title: { type: "string" },
          device: { type: "string", enum: ["phone", "tablet"] },
          theme: { type: "string", enum: ["light", "night"] },
          purpose: { type: "string" },
        },
        required: ["file", "title", "device", "theme", "purpose"],
      },
    },
    decisions: { type: "array", items: { type: "string" } },
    new_copy_without_burmese: { type: "array", items: { type: "string" } },
    open_risks: { type: "array", items: { type: "string" } },
  },
  required: [
    "spec_path",
    "screens",
    "decisions",
    "new_copy_without_burmese",
    "open_risks",
  ],
};

const CONSIST_SCHEMA = {
  type: "object",
  properties: {
    shared_vocabulary: { type: "string" },
    amendments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          moment: { type: "string" },
          changes: { type: "array", items: { type: "string" } },
        },
        required: ["moment", "changes"],
      },
    },
  },
  required: ["shared_vocabulary", "amendments"],
};

const CRITIC_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "fix"] },
    blocking: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
        },
        required: ["issue", "evidence", "fix"],
      },
    },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "blocking", "suggestions"],
};

const EXAMPLE_COMMON = `Context: Mandalay Morning Star (a small family restaurant + grocery; Mom cooks, Dad runs the counter; Burmese-first parents; regulars invited by name) is refining its QR app's diner and staff paths. Repo root: /home/user/mms-platform (read-only for you: never edit, never git). A design pass drew THREE concepts per moment (quiet / guided / glanceable); the owner has now PICKED. Your files live under ${BRIEF} (briefs, judges' notes, RULES.md) and the existing concept artboards under ${PROJ} (files named mN-quiet-1.dc.html, mN-glance-2.dc.html, …).

THE OWNER'S ANSWERS (binding):
1. Direction (the owner, verbatim: "I prefer diner moments guided and staff moments glanceable. I actually love all 3 directions but could be more enhanced, elevated, world-class design-thinking"): diner phone moments 1–4 are GUIDED; staff tablet moments 5–8 are GLANCEABLE. The picked angle is the BACKBONE, not the whole answer — the owner loves all three, so ELEVATE: graft the best of the other two angles into it (quiet's restraint — the fewest new claims, reuse of words the family already reads on the console; glanceable's arm's-length shape language and its one moment of delight; guided's spoken next step), and fix every weakness the judges named for the backbone (read their score notes — e.g. guided's counts on a shared cart, cards above the food, a second step vocabulary, a step rail for a one-step task; glanceable's nagging marks and louder-than-Late slabs). Then push it to WORLD CLASS: ask what the best hospitality and retail products in the world do at this exact moment (a great maître d', a Japanese ticket-and-token counter, a boarding pass in a wallet, a great KDS) and bring the essence of that — within this family's real constraints (Burmese-first parents, a small room, one counter, no new hardware, no fabricated promises).
2. Moment 2: until live card keys are switched on (OPEN-ITEMS C2), the dine-in Bill shows ONLY "Pay at the counter" — no phone card button.
3. Moment 1: a guest whose dish waits on the host's Send gets the words ("our staff can send it too") PLUS a big "Show a server" card (Table 7 and the waiting dishes in both languages, for Dad to read from the counter) PLUS a quiet nudge to the host's phone ("Let Aye know" — the guest taps it; the host's phone shows a quiet, silent, non-blocking line; host-only Send stays enforced on the server).
4. Moment 8: if a dish still waits for a manager when the guest is ready to pay, staff see a warning and MAY take payment anyway (the dish stays charged; a later approval becomes a refund) — they are never blocked.
DEFAULTS the owner did not override (apply them): moment 3 — "I'm here" can be tapped any time on the pickup day, with a 6-second undo; moment 4 — the miss says "Or ask at the counter"; moment 6 — the paid card's big button is "Back to the counter" (Dad keeps hearing the bell), a Walk-up shortcut may sit beside it only as a secondary; moment 7 — clearing an unpaid table whose food went to the kitchen takes one extra tap that first shows the dishes and the loss, then a 6-second Undo; moment 5 — the round is labelled with its number ("အလှည့် 2 / Round 2"), drawn glanceably but never louder than a Late ticket.

STANDING RULES (from CLAUDE.md / DESIGN-LANGUAGE.md — honour all): amounts never optimistic and always server-derived; never a count on a SHARED (dine-in) cart; one hero verb per state (one primary, everything else secondary); copy promises only what the code keeps (no fabricated ETAs, counts, or hours — there are NO business hours anywhere); bilingual on one surface with English leading on diner screens and Burmese-first on staff screens; never invent Burmese — reuse shipped strings (apps/qr/i18n/*, apps/qr/lib/*copy*.ts) or the briefs' drafts, else leave it English-only and list it; ≥44px targets, one live region per view, reduced-motion escort on any animation; tokens not hardcoded colours; glass is Night-only; KDS and TV board are Night-forced.`;

const EXAMPLE_MOMENTS = [
  {
    id: "m1",
    name: "A tablemate adds a dish, and it waits on someone else's Send",
    picked:
      "GUIDED backbone — \"Next Stop: Kitchen\" (the spoken next step, the host read from server truth, the visible Undo caption 'The kitchen sees it when the countdown ends.', the name asked once when it starts to matter) — elevated with QUIET's shared console word 'Not sent yet · မပို့ရသေး' on the order bar every phone already carries, and GLANCEABLE's hold-up card; plus the owner's answer 3 (Show a server card + Let Aye know nudge). Fix guided's judged weaknesses: NO counts on the shared cart ('3 not sent yet', '3 dishes from …' are out), NO card above the food on /menu (§21), far fewer new Burmese strings.",
    screens: 3,
    plan: '(1) the GUEST\'s Order page while their dish waits: the guided wait block that names the next step and who takes it, with its two ways forward — "Show a server" and "Let Aye know" (one primary only); (2) the full-screen Show-a-server card held up for Dad (Table 7 big over စားပွဲ 7, "Not sent yet · မပို့ရသေး", the waiting dishes in both languages, Done); (3) the HOST\'s phone after the nudge: the quiet nudge line and the guided Send with its visible countdown caption.',
  },
  {
    id: "m2",
    name: "Asking for the bill at the table",
    picked:
      "GUIDED backbone — \"The Counter Path\" (the Bill says the next step out loud; Dad's 'Next: take $X in cash.' line; the cash-only trust line; the settling sentence keyed on the split surface) — elevated with QUIET's slip (one docked door, the phone becomes the slip after the ask, reuse of shipped Burmese 'ရှင်းပြီး။ ကျေးဇူးပါ') and GLANCEABLE's till placard (the table number + the SAME total big enough to read across the counter, Dad's card showing that same figure, the ask's age). Owner answer 2: counter-only Bill until live card keys. Fix guided's judged weakness: NO second numbered step vocabulary inside a Bill that already has the Order · Bill · Pay rail — the guidance lives in the rail and in one sentence.",
    screens: 3,
    plan: "(1) the guest's Bill before the ask: the guided sentence, the receipt, ONE door \"Pay at the counter\" (no card button); (2) every phone at the table after the ask: the counter pass (table number + the total, readable at arm's length, the next step said once); (3) Dad's counter tablet (1366×1024, light) with the asked table: the same total, the ask's age, his next step, one hero (\"Take cash\").",
  },
  {
    id: "m3",
    name: "The pickup promise, from the Pay tap to the bag in hand",
    picked:
      "GUIDED backbone — \"The Claim Ticket\" (a 'Now' sentence, a where-am-I path, the ticket, one question; the late state gets a door; the 'please order during open hours' refusal rewritten because no hours exist) — elevated with QUIET's 'Time, Then Code' (the ticket shows the time while cooking and flips to the code at Ready, using Dad's exact lane strings) and GLANCEABLE's Claim Tag delight (the ticket turns over at Ready). Fix guided's judged weakness: never say 'in the kitchen' for a held, unfired ticket.",
    screens: 3,
    plan: '(1) /track while cooking, just after the guest tapped "I\'m here" (allowed any time on the pickup day): the Now sentence, the path, the ticket with the time, and the 6-second undo in place; (2) Ready: the ticket turns over to the big code, the path on its Ready stop; (3) the late state: the slot has passed and the bag is not bagged yet — honest words, no ETA, a 44px call-the-restaurant door.',
  },
  {
    id: "m4",
    name: "The jar that won't scan (the grocery miss)",
    picked:
      "GUIDED backbone — \"Let's Find It Together\" (the miss answered where the eye is; the warm 'It's not you — most shelf codes aren't in the app yet.'; back where you were with a forgiving Undo; the arm's-length Burmese counter card) — elevated with QUIET's 'The Lens Stays Put' (the camera never scrolls away, the miss lives inside the lens, one primary) and GLANCEABLE's Paper Tag shape language (a tag means not added, a disc means in your basket — never colour alone). Fix guided's judged weaknesses: NO step rail for a one-step task, NO two equal buttons (search is the primary; the counter is a quiet line), the search field does not push the stage down. Default: the miss says 'Or ask at the counter'.",
    screens: 2,
    plan: '(1) the miss, answered inside the lens: the honest sentence, Search by name as the one primary, "Or ask at the counter" as a quiet line; (2) the Name sheet over the still-live lens when nothing matches: the "It\'s not you" empty state and the counter way out (the Burmese counter card if the brief\'s drafts support it).',
  },
  {
    id: "m5",
    name: "The second round lands on a ticket that's still cooking (kitchen KDS, Night)",
    picked:
      'GLANCEABLE — "One Send, One Sheet", softened per the judges (the round tab never outranks Late; a card never changes size; round counted per session; undo pill names the round; "{t} still has a card on the board")',
    screens: 2,
    plan: "(1) round 2 lands as its own card with its round tab, beside a LATE ticket that still reads loudest; (2) Mom has served round 1; round 2 keeps cooking; the undo pill names the round.",
  },
  {
    id: "m6",
    name: "The walk-up cash sale at the counter (counter tablet, light)",
    picked:
      'GLANCEABLE — "Shape of the Sale", grafted with the judges\' fixes (money-corner double-tap guard, "unpriced" refusal, bigger Total in a type token, "Nothing was taken — the order is still here." on a clean cancel) and the default "Back to the counter" hero',
    screens: 2,
    plan: '(1) the cash tray risen over the pad: tender tiles, the change readout in the money corner; (2) paid: the seal with the change, the #CODE stub, "Back to the counter" as the ONE hero and Walk-up as a quiet secondary.',
  },
  {
    id: "m7",
    name: "Clearing a table (counter tablet, light)",
    picked:
      'GLANCEABLE — "Turn Signals", softened per the judges (the loss stub only once Clear is reached for, never on every unpaid pane during service; window says "Clearing", never "Cleared"; the "Did they pay?" fork with Take cash and Merge from "Have They Left?")',
    screens: 2,
    plan: '(1) the floor at turnover: a paid table\'s green slab, and a just-tapped table showing "Clearing Table N" with Undo and "Seat next party" in the slot; (2) an unpaid table whose food went to the kitchen, after Dad reached for Clear: the dishes, the loss, the "Did they pay?" fork (Take cash · Merge with another table) before the loss commit.',
  },
  {
    id: "m8",
    name: "A dish needs a manager (void/comp approval on a shared tablet; counter tablet, light)",
    picked:
      'GLANCEABLE — "Raised Flag", softened per the judges (no pennants spread across every bar/tile/row — the flag lives where the decision is; the roster lists only people who can sign; Enter never submits when two verbs share the field; a Deny-only card for an already-paid table) plus owner answer 4 (warn, then take payment anyway)',
    screens: 3,
    plan: '(1) the asker\'s sheet: one chip picks what and why, the picker lists only people who can sign; (2) the manager deciding: their name pre-picked, PIN, Approve / Deny; (3) Take payment with a flag still up: the warning names the consequence and "Take payment anyway" stays possible beside "Decide it here".',
  },
];

// EXAMPLE_COMMON and EXAMPLE_MOMENTS are the 2026-10-07 run's values: an example of the SHAPE only.
// A new round passes its own owner answers and picked moments; the example runs only on
// args.useExample, so a stale round can never be regenerated by accident (Codex round 4 on #319).
const COMMON = A.useExample ? EXAMPLE_COMMON : A.common;
const MOMENTS = A.useExample ? EXAMPLE_MOMENTS : A.moments;
if (!COMMON || !Array.isArray(MOMENTS) || MOMENTS.length === 0) {
  throw new Error(
    "2-refine needs args.common (the owner's answers, the defaults and the standing rules) and args.moments (the picked moments, shaped like EXAMPLE_MOMENTS)",
  );
}

phase("Synthesize");
const specs = await parallel(
  MOMENTS.map(
    (m) => () =>
      agent(
        `${COMMON}

YOUR MOMENT: ${m.id} — ${m.name}
PICKED: ${m.picked}
SCREENS TO SPECIFY (exactly ${m.screens}): ${m.plan}

Read first: ${BRIEF}/RULES.md, ${BRIEF}/brief-${m.id}.md (all three concepts, their screens, and the judges' notes), and ${BRIEF}/${m.id}.json → .judgement (scores, recommended, grafts, reasoning — the FULL text; the brief truncates nothing but the json holds the authoritative grafts). Look at the picked concept's existing artboards in ${PROJ} (${m.id}-*.dc.html for the picked angle) — the refined screens must read as the same design, evolved.

Then VERIFY against the code every product claim the refined design depends on (a state that exists, a predicate, a string, a column): grep the repo, cite file:line in the spec. Where a claim fails, change the design, not the claim.

Write the refined spec to ${BRIEF}/picked-${m.id}.md: for each screen, a heading "SCREEN picked-${m.id}-<k>.dc.html — <title>", then device (phone 390×844 or tablet 1366×1024), theme, LAYOUT (pixel regions top to bottom, exact sizes from the product's tokens), COPY (English) verbatim, COPY (Burmese) — ONLY shipped strings or the briefs' drafts, each with its source — and A11Y (names, roles, live region, focus). End with "DECISIONS" (what you chose and why, one line each, citing the owner answer or graft) and "OPEN RISKS".

Use files picked-${m.id}-1.dc.html … picked-${m.id}-${m.screens}.dc.html in order. Return the structured summary.`,
        { label: `synth:${m.id}`, phase: "Synthesize", schema: SYNTH_SCHEMA },
      ).then((r) => (r ? { ...r, moment: m.id } : null)),
  ),
);

const okSpecs = specs.filter(Boolean);
log(`specs written: ${okSpecs.map((s) => s.moment).join(", ")}`);

phase("Consistency");
const consist = await agent(
  `${COMMON}

Eight refined specs are written: ${okSpecs.map((s) => `${BRIEF}/${s.spec_path.split("/").pop()}`).join(", ")}. Each was refined in isolation. Read ALL of them, then act as the system designer who must ship them together:
- Diner (m1–m4, all GUIDED now): four independently guided moments must speak ONE guide voice — the same grammar for "what happens next, and who does it" (one sentence, never a second step vocabulary beside the Order · Bill · Pay rail, never a count on a shared cart), the same placement for the next-step line, and the same words and mark for the same state on every surface (e.g. "Not sent yet · မပို့ရသေး" on the guest bar, the Show-a-server card AND Dad's floor; the counter ask's total on the guest's pass and on Dad's card; the pickup ticket's time/code on the guest's phone and on Dad's lane).
- Staff (m5–m8, all GLANCEABLE now): four independently invented loud vocabularies (round tabs, a gold cash tray + green seal, green clear slabs + loss stubs, raised flags) will land on the SAME counter and kitchen screens. Define ONE shared glanceable vocabulary — what green, gold, cream, warn and a flag each MEAN, shape + word + colour so colour is never alone, and a loudness ladder (Late and money-in-doubt loudest; done/paid calm) — and amend each spec so no two moments use the same mark for different meanings and nothing nags during normal service.
- Cross-check the owner's answers and defaults are applied exactly.
Read DESIGN-LANGUAGE.md sections as needed (repo docs/DESIGN-LANGUAGE.md — grep, do not read whole).
Return the shared vocabulary (a compact paragraph) and, per moment, the concrete changes its spec must take (empty list if none).`,
  { label: "consistency", phase: "Consistency", schema: CONSIST_SCHEMA },
);

const amendFor = (id) => {
  const a = ((consist && consist.amendments) || []).find(
    (x) => x.moment === id,
  );
  return a && a.changes.length
    ? a.changes.map((c) => `- ${c}`).join("\n")
    : "- (none)";
};
const vocab = consist
  ? consist.shared_vocabulary
  : "(consistency pass unavailable — keep each spec as written)";

const results = await pipeline(
  okSpecs,
  (s) =>
    agent(
      `${COMMON}

You are an ADVERSARIAL design critic with zero agreeableness. Review the refined spec ${s.spec_path} for moment ${s.moment} (read it in full, plus ${BRIEF}/brief-${s.moment}.md for the binding rules). It must ALSO take these system amendments:
${amendFor(s.moment)}
Shared staff/diner vocabulary: ${vocab}

Find BLOCKING defects only, each with evidence (spec line + code file:line or rule): a promise the code cannot keep; an amount that could be optimistic or computed client-side; a count on a shared cart; two primaries in one state; an owner answer or default not applied; invented Burmese (check the claimed source exists — grep it); a target <44px, a control without a name, two live regions, colour as the only signal; text under 4.5:1; staff text unreadable at arm's length; a staff state that nags during normal service. Verify every file:line the spec cites — a wrong citation is a finding. Suggestions go separately. verdict "fix" if any blocking.`,
      { label: `critic:${s.moment}`, phase: "Critique", schema: CRITIC_SCHEMA },
    ),
  (crit, s) => {
    const fixes =
      crit && crit.blocking && crit.blocking.length
        ? crit.blocking
            .map((b, i) => `${i + 1}. ${b.issue} — FIX: ${b.fix}`)
            .join("\n")
        : "(none)";
    return agent(
      `${COMMON}

Draw the refined artboards for moment ${s.moment}. Read in full: ${BRIEF}/RULES.md (the file format and every rule — they all apply), the refined spec ${s.spec_path}, and the picked concept's existing artboards in ${PROJ} for visual continuity (same example data: table, dishes, names, amounts).

Apply, in this precedence: (1) the owner's answers; (2) these BLOCKING fixes from the critic:
${fixes}
(3) these system amendments:
${amendFor(s.moment)}
Shared vocabulary: ${vocab}
(4) the spec.

Write exactly these files with the Write tool into ${PROJ}/ : ${s.screens.map((x) => x.file).join(", ")} — phone 390×844 or tablet 1366×1024 per the spec, root fixed at that size, $preview to match. No annotations or rationale on the artboard; draw the screen as the guest or staff member sees it. Never render, verify, or read your files back. Finish with one line per file: file name + what it shows (≤14 words).`,
      { label: `draw:${s.moment}`, phase: "Draw" },
    ).then((drawn) => ({
      moment: s.moment,
      screens: s.screens,
      decisions: s.decisions,
      new_copy_without_burmese: s.new_copy_without_burmese,
      open_risks: s.open_risks,
      critic: crit,
      drawn,
    }));
  },
);

return {
  vocab,
  amendments: consist ? consist.amendments : [],
  results: results.filter(Boolean),
};
