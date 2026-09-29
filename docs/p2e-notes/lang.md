# Phase 2e · lang — build notes

Area: the staff language as a three-way, per-device setting (owner decision 2, 2026-09-24). Branch
`p2e/lang`, base `b8be8f5` (main 2b6a957 + all of Phase 2d). Spec: `scratchpad/p2/language-3way.json`
(`final` + `critique`). Integration merges the sections below into the named docs; this file is not
itself a doc of record.

⚠️ **2a's language hardening was NOT on disk at `b8be8f5`** (the scope said "verify": `grep -rn
"nextLangWrite\|langChainOutcome"` returned nothing, and `StaffLangSwitch.tsx` was the pre-2a
`useTransition` switch). So this PR builds it too — as the generic chain the 3-way spec lifts it into
(`useLangModeWrite`), not as a separate 2a patch. The red-first run against the old switch confirmed
every defect the 2a spec described (see §9).

## 1 · DESIGN-LANGUAGE draft

### §17 bullets

- **The language is a device setting, three ways (P2e, owner decision 2).** Burmese only · Both ·
  English, stored in the existing `mms_staff_lang` cookie as a MODE (`"my-only" | "both" | "en"`),
  while every component still receives a SCRIPT (`"en" | "my"`) plus one boolean, `echoes`. The two
  literal sets never overlap (`"my"` is never a mode), so passing one for the other is a compile
  error. **Both is the default and renders exactly what `"my"` rendered before P2e**; an absent or
  legacy `"my"` cookie is Both; a rollback reads both Burmese modes as `"my"` — it can never turn a
  device English. "This device" is really this browser's cookie jar (an iPad Home-Screen app and
  Safari keep separate jars; clearing site data resets to Both) — both directions fall back to the
  default, which drops nothing.
- **Where it lives.** It left EVERY in-service bar (a mis-tap target 10px from Help and Lock, ~152px
  of tablet bar). The four FRONT DOORS — the sign-in form, `/staff/lock`, the outage shell, the error
  screen — keep the two-script pill exactly where it was, passed through their bar's `trailing` slot
  (`StaffBar` mounts none). Mid-service it is two taps away: a **Language** row in the Help sheet on
  the kitchen and the counter, BEFORE "Something's wrong" (the report stays LAST). Every other screen
  reaches it through the doors' More, whose LAST tile is **Language** →
  `/staff/login?show=lang` (a query param, never a `#hash` — §26), the Profile's language card, the
  pressed mode focused on arrival. The Help row, its title, the More tile, the Profile card's
  heading and scope line and every failure line are **both scripts on every device and in every
  mode** (`<Chrome lang="my" … keepEcho>`): the way back must be readable by whoever the current mode
  is wrong for.
- **The rows.** Three rows, Burmese only · Both · English: the autonym sample (component constants,
  never keys — `မြန်မာ`, `မြန်မာ English` with a literal space, `English`) is the accessible name; the
  mode's plain description rides `aria-describedby` in the device's own mode; a tick on the pressed
  row so the state is never colour alone. The pressed row wears the ONE lit cap (the shared selector
  list) and declares no fill of its own; its description takes the cap's ink. 64px rows, `.staff-press`.
- **Burmese only drops the ECHO, never the PAIR, and never on the K15-HIGH band.** An echoed
  `<Chrome>` keeps its `.chrome-pair` wrapper with ONE child (every Burmese size rule is
  `.x > .chrome-pair > [lang="my"]`); no middot, no `.chrome-en`. A key in `STAFF_K15_HIGH` — "the
  strings a wrong word takes SERVICE down over", wider than food and money (the logins and lock-outs,
  the outage and connection lines, the report's outcome, the late and held tickets, the money words)
  — keeps its English line whatever the device (the shared kitchen tablet's cross-check, Dad's line),
  so adding a `// K15-HIGH` marker is a display change too. The Burmese-only row says exactly that,
  in the band's own words ("English stays where a wrong word would stop service"), and never "only".
  `keepEcho` is confined by `check-staff-lang` rule 6 to three files, a literal `lang="my"`, a literal
  echo and a LANGUAGE KEY (a literal `shell.lang.*`, or the More tile's `k={t.k}` in StaffDoors). The
  KDS ticket (`TicketText`), dish names and the P2m/K25 English never change with the mode, and the
  note under the rows says so — the Help sheet's Text size preview is a dish name, so it renders
  through the ticket's `TicketDishTitle` (Burmese over English in every mode). No provider (the wall
  TV) keeps every echo.
- **One write chain, host-owned (`useLangModeWrite`).** The in-flight guard is a REF read at tap
  time; a tap while a write is out only replaces the intent, and the writes serialize so the LAST
  pick wins (§4.2) with ONE refresh at the end; the cap moves at the tap and snaps back to the
  CONFIRMED mode on every failure (§4.4); every write is `raceTimeout(…, 15 000)` inside try/catch,
  so a refusal, a rejected Server Action and a hang all end as the failure line — never the error
  boundary. The pick and `confirmed` adopt the provider only BETWEEN chains: a refresh from an
  earlier write can land while a newer one is out, and must neither move the cap back nor become
  what the chain thinks the server holds; a chain that wrote nothing adopts the provider's latest
  word. Nothing is ever `disabled` or `aria-disabled` (the control never refuses a tap); the
  group says `aria-busy` and the pending cap dims (§17's busy dim). The Lock circle REFUSES
  re-entry — a lock is not a choice you correct mid-flight; the language controls never do.
- **A language write never makes a Sheet `busy`** (M82 is for irreversible writes): ✕, Escape, the
  scrim and the drag stay live, and the Help host owns the write so closing never cancels it. A tap
  on the confirmed mode closes the sheet (like the size rows); a tap on another stays open until the
  PROVIDER shows the written mode — the board behind is already in the new tongue as the sheet
  slides away; a second tap on the pending mode does nothing, and every writing tap cancels the wait
  for the last write (its late refresh must not close the sheet). A failure lands in the sheet while
  it is open (`role="alert"`, both tongues, the menu and Language views) and as the bar tail's
  `.staff-bar-msg` line beside the ? circle otherwise — ONE line ever: the in-sheet lines are
  `open &&` (the content stays mounted through the exit slide, M76) and the tail's `!open &&`. The
  next open answers it; a close answers only a line the person SAW, so a failure that landed on How,
  Text size or Report is said in the bar tail after the close, never cleared unsaid. The Profile's failure speaks through the view's ONE region (`ViewStatusProvider`) with
  its visible line `aria-hidden`.
- **The front-door pill writes a MODE**, resolved against the confirmed mode at tap time: the script
  the device already reads keeps its mode (a Burmese-only device stays Burmese-only, and a brushed
  "English" corrected mid-write returns to it); from a confirmed English device, မြန်မာ restores the
  default, Both. Its focus ring is drawn INSIDE each segment (`outline-offset: -3px`, pill-shaped) —
  the pill's `overflow: hidden` clipped the global +2px ring (xcut-2's language third).

### §6 (one sentence)

- A device may drop the chrome's English echoes (Burmese only) except on the K15-HIGH band — the
  words where a wrong word would stop service — and on the language surfaces themselves; the pair
  stays, and dish names and the kitchen ticket never change with the device.

## 2 · CHANGELOG

- **P2e — the staff language, three ways, per device.** Burmese only · Both · English, per device
  (Both = the old Burmese exactly; no device changes on deploy; rollback-safe). The pill leaves every
  in-service bar and stays on the four front doors (sign-in, lock, outage, error); the Profile gets a
  language card, the kitchen and counter Help sheet a Language row, the doors' More a last Language
  tile — each in both scripts on every device. Burmese only drops the English echoes except on the
  K15-HIGH band (the words where a wrong word would stop service). One hardened write chain behind all of them (a rejected or hung
  write is a bilingual line, never the error screen; latest pick wins; the cap moves at the tap and
  reverts to what the server holds). No one-time notice (owner decision pending). No SQL.

## 3 · OPEN-ITEMS rows

| Sev   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why / where                                                                                                                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | **CLOSES P2x** ("The staff language becomes a three-way Burmese / Both / English per-device setting in Profile (slice 2e …)", `planned:2e`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence: `lib/staff-lang.ts` (modes, parse, `scriptOf`/`echoesShown`/`modeOf`/`modeForScript`), `StaffLangSwitch.tsx` (pill · rows · Profile card), `HelpButton.tsx` (Language row), `lib/staff-more.ts` (tile), `StaffBar.tsx` (no control), `check-staff-lang` 4a–4e + 6, 49 KILLED mutants. |
| owner | **One-time relocation notice?** Built with none (the spec's recommendation). The approved 2026-09-24 recommendation included a `HELP_SHEET_REVISION` bump for kitchen + counter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Trade-off: someone reaching for the old bar pill mid-service on the kitchen board finds it only through Help, untold. Cheapest honest form: bump the revision (one constant; the decks re-open once per device).                                                                                |
| owner | **Burmese only keeps the K15-HIGH English** (built as YES — the spec's owner question 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Dropping it on a device nobody else reads is a one-line change in `Chrome.tsx` (the `STAFF_K15_HIGH.has(k)` term); the row description ("English stays where a wrong word would stop service") would change with it.                                                                            |
| low   | **Composite accessible names under Burmese only are contained piecewise, not contiguously** (WCAG 2.5.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `CounterOrderCard` `subjectOf`, `RefundsNeededStrip`: names keep the English echo between Burmese pieces while the screen drops it. Per-key containment holds (stated in `lib/staff-labels.ts`); no AT users on these tablets.                                                                  |
| low   | **K37 grows**: `EntrySkeleton` now draws the front door's 152px PILL in the tail (the form and lock shapes), but the SIGNED-IN `/staff/login` lands without it (its bar carries Lock) and one card taller (the language card).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `components/staff/EntrySkeleton.tsx` docblock states the limit; the neutral-shape option already filed on K37.                                                                                                                                                                                  |
| med   | **The Help sheet's REPORT send awaits a Server Action inside `startTransition(async …)` with no try/catch** (`HelpButton.tsx` `send()`), and so does the manager approval form (`ApprovalsBoard.tsx` ~:403).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P2e's red-first CONFIRMED the mechanism (§9): under React 19 a rejection there is rethrown to the nearest error boundary — the whole board. Same fix as the language chain: try/catch the await (or LockButton's plain async handler). Not taken here — 2e does not touch the report send.      |
| low   | **A language failure that lands while the Help sheet is on How / Text size / Report is not said until the person returns to the menu or the Language view, or closes the sheet (then the bar tail says it).** Never lost: a close keeps a line the person did not see (corrected after review — the first cut's close cleared it unsaid, and this row wrongly said it waited).                                                                                                                                                                                                                                                                                                                                  | `HelpButton.tsx` `show()`: those views have no line of their own (Report already holds the view's one `role="status"`), so the line waits for a view or the tail that can speak it. The chain still reverts the cap at once.                                                                    |
| low   | **A stale `router.refresh()` that lands AFTER a language chain ended, but before that chain's own refresh, is adopted for that moment.** The tick shows the older mode until the last refresh lands, and a tap in between is judged against it (at worst one redundant write, or a Help-sheet close on the older mode).                                                                                                                                                                                                                                                                                                                                                                                         | `useLangModeWrite.ts` (stated limit in the effect's comment). Mid-chain it is closed (review finding 4); after the chain, Next gives no signal for WHICH refresh landed — a fix needs the refresh's own completion (e.g. `useTransition` around `router.refresh()`), not a guess.               |
| low   | **`/staff/team` → `/staff/login#team-h` is a hash landing behind `login/loading.tsx`** (a §26 shape predating P2e).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Noted for its owner; the P2e tile uses `?show=lang` for exactly this reason.                                                                                                                                                                                                                    |
| low   | **xcut-2 (STAFF_POLISH_AUDIT): the language-switch third is closed** (inset ring, `.staff-lang-btn:focus-visible { outline-offset: -3px }`, pinned by `StaffLangSwitch.test`'s CSS parse). The `.kds-line` and `.staff-row` thirds stay open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Paint is a browser fact — the preview check below is the proof.                                                                                                                                                                                                                                 |
| check | **Preview gate (not measurable here — no browser):** 390×844 `/staff/lock` and `/staff/login` with the soft keyboard up (the pill in the bar, reachable); `/staff/login?show=lang` signed in (pressed row focused and in view); 1024×768 `/staff/kitchen` in Night with the station filter (measure title + `.staff-bar-mid` before/after — the tail should be ≈162px shorter); Help → Language → English (✕ live, the board flips, the sheet closes); Burmese only (bar titles keep 30px Burmese, no English under titles/doors, but Mark sold out / Done / Cook now keep English, and the ticket keeps Dad's line); DevTools Offline (the bilingual line in the sheet; closed mid-write → the bar-tail line). | Spec `tests` → "Preview gate before merge".                                                                                                                                                                                                                                                     |
| K15   | **+6 Burmese drafts, +1 reworded, 0 K15-HIGH** (§6 below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `lib/i18n/staff.ts` Phase 2e · lang block; `STAFF_K15_HIGH` unchanged (measured: the autonyms suite's set-equality is green).                                                                                                                                                                   |

P2d (`<html lang>`, WCAG 3.1.1) and P2m/K25 (English still under a Burmese console) stay open; the
rows' note cites them in plain words.

## 4 · Mutate-set / CLAUDE.md enumeration changes

Measured at head with the documented greps (never counted by eye):

- `grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u | wc -l` → **184** (base
  `b8be8f5`: 179 — so CLAUDE.md's "163" was already stale at the base by Phase 2d's additions).
- Buckets now: **146** `apps/qr/lib` · **3** `apps/qr/app/api` · **34** under `apps/qr/components` ·
  **1** `packages/db` = 184.
- `grep -cE '^\s+id: "' scripts/verify-slice.mjs` → **1320** (base 1271; +49 — 34 in the build, 15
  after review).

Files JOINING the mutate set (5):

| Path                                           | Bucket                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `apps/qr/components/staff/useLangModeWrite.ts` | component (a HOOK under components/, like `useStaffSend.ts`) |
| `apps/qr/components/staff/StaffLangSwitch.tsx` | component                                                    |
| `apps/qr/components/staff/HelpButton.tsx`      | component                                                    |
| `apps/qr/components/staff/StaffDoors.tsx`      | component                                                    |
| `apps/qr/lib/staff-more.ts`                    | lib                                                          |

(`lib/staff-lang.ts` and `components/staff/Chrome.tsx` were already in the set.)

Mutants added (49, block `// ── Phase 2e · lang ──` at the end of `MUTANTS`), all **KILLED** by
`node scripts/verify-slice.mjs --no-gate --only=p2e-lang` (re-run at the review head: "49 mutants
caught, no orphans"):

- `lib/staff-lang.ts` (suite `lib/staff-lang.test.ts`): `p2e-lang/mode-default-drops-echoes` ·
  `mode-both-falls-to-fallback` · `mode-legacy-my-reads-burmese-only` · `mode-lax-parse` ·
  `script-of-both-is-english` · `echoes-mode-inert` · `echoes-off-for-both` ·
  `echoes-off-without-provider` · `mode-of-en-reads-both` · `mode-of-echoes-ignored` ·
  `script-switch-drops-burmese-only` · `script-switch-to-burmese-only` · `next-write-ignores-confirmed`
  · `chain-alerts-a-met-wish` · `chain-skips-refresh-after-partial-write` · `chain-cap-drops-written`.
- `components/staff/Chrome.tsx` (suite `Chrome.test.tsx`): `p2e-lang/burmese-only-keeps-the-echo` ·
  `burmese-only-keeps-the-middot` · `burmese-only-drops-the-pair` · `keep-echo-ignored` ·
  `k15-high-echo-dropped`.
- `components/staff/useLangModeWrite.ts`: `p2e-lang/pending-tap-rewrites` · `hang-never-ends` ·
  `rejection-escapes` · `failed-chain-refreshes` (suite `StaffLangSwitch.test.tsx`);
  `pending-tap-closes-help` (suite `StaffLangRows.test.tsx`).
- `components/staff/StaffLangSwitch.tsx`: `p2e-lang/pill-writes-a-script` ·
  `pill-failure-follows-the-device` (suite `StaffLangSwitch.test.tsx`); `profile-second-region`
  (suite `StaffLangRows.test.tsx`).
- `components/staff/HelpButton.tsx` (suite `HelpButton.test.tsx`):
  `p2e-lang/help-sheet-busy-for-a-preference` · `help-closes-before-the-board-changes` ·
  `help-stale-failure`.
- `lib/staff-more.ts` (suite `lib/staff-more.test.ts`): `p2e-lang/more-drops-language`.
- `components/staff/StaffDoors.tsx` (suite `StaffDoors.test.tsx`): `p2e-lang/more-tile-follows-the-device`.
- **After review (15):** `components/staff/HelpButton.tsx` (suite `HelpButton.test.tsx`):
  `p2e-lang/help-title-drops-english` · `help-scope-drops-english` · `help-bar-line-drops-english` ·
  `help-menu-line-drops-english` · `help-view-line-drops-english` · `help-sample-follows-the-device`
  · `help-stale-refresh-closes` · `help-view-line-through-exit` · `help-menu-line-through-exit` ·
  `help-bar-line-while-open` · `help-close-clears-unseen`; `components/staff/StaffLangSwitch.tsx`
  (suite `StaffLangRows.test.tsx`): `p2e-lang/profile-line-drops-english`;
  `components/staff/useLangModeWrite.ts` (suite `StaffLangRows.test.tsx`):
  `p2e-lang/pick-drops-mid-chain` · `confirmed-stale-mid-chain` · `unwritten-chain-ignores-provider`.

Re-anchored (2): **`p2e-lang/help-stale-failure`** (after review) — its find is now the close's
`if (next || lineShown) langWrite.clearAlert();`, deleted whole; same meaning (a failure the person
saw is answered by the next open or close). **`chrome/burmese-half-dropped`** — its find now spans `{my}` + the new
`{echoes && echo === "inline" && " · "}` middot line; same meaning (drop the Burmese half of every
echoed pair). `--only=chrome/` → all 5 chrome mutants KILLED; `--only=staff-lang/` → the 4 original
staff-lang mutants KILLED (their anchors on `staff-lang.ts:1-76` are byte-identical).

## 5 · Owner-visible behaviour changes

- The language pill is **gone from every in-service bar** — the kitchen, the counter and the doors,
  the tips, menu, glossary and table screens, the order pad, and the signed-in sign-in screen. It
  stays **exactly where it was** on the sign-in form, the lock screen, the outage screen and the
  error screen.
- The kitchen and counter **Help** (the gold ?) has a new **ဘာသာစကား / Language** row, before
  "Something's wrong". It opens three choices: **မြန်မာ** (Burmese only), **မြန်မာ English** (Both —
  what every device shows today) and **English**, each with a one-line description; the chosen one is
  gold with a tick. Tapping another switches the whole screen; the sheet closes once the board has
  changed. Tapping the current one just closes it.
- The doors' **More** list ends with a **ဘာသာစကား / Language** tile; it opens the signed-in sign-in
  screen with a new **language card** under the person's own card, the current choice focused.
- **Burmese only** is new: buttons and titles lose their small English line, EXCEPT the words where a
  wrong word would stop service (Mark sold out, Done, Cook now, Undo, the cash and payment words,
  sign-in and lock-out messages, the outage and connection lines, late tickets), which keep their
  English for whoever else reads the kitchen tablet; the language controls keep theirs too. Its row
  says so: "Burmese only — English stays where a wrong word would stop service". The kitchen ticket
  and dish names do not change at all.
- The Help sheet's **Text size** preview now shows its dish the way the ticket does on every device —
  မုန့်ဟင်းခါး over "Mohinga" — where before it was English alone on an English tablet.
- Nothing changes for any device on deploy: "Both" is exactly today's Burmese.
- A language change that fails (offline, a stale tab after a deploy, a hung connection after 15 s)
  now says so in **both** Burmese and English beneath the controls and puts the choice back — it can
  no longer replace the whole board with the error screen. A quick mis-tap corrected at once is
  written in order and the screen redraws once. Only ONE failure line ever shows; one that lands
  while the person is reading How / Text size / Report is said beside the ? circle once they close.
- The keyboard focus ring on the front doors' pill is now fully visible (drawn inside the pill).

## 6 · K15 strings

Every MY below is a Claude-authored draft pending Min's native check; none is K15-HIGH.

| Key                                              | EN                                                                                                                                                                                                              | MY                                                                                                                                                                                                               | HIGH?                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell.lang.row`                                 | Language                                                                                                                                                                                                        | ဘာသာစကား                                                                                                                                                                                                         | no (grounded: the word inside `shell.lang.group`)                                                                                                                                                          |
| `shell.lang.scope`                               | Only this device changes — every tablet and phone keeps its own.                                                                                                                                                | ဒီစက်ပဲ ပြောင်းပါမယ် — တက်ဘလက်နဲ့ ဖုန်း တစ်ခုစီက ကိုယ့်ဟာကိုယ် ထားပါတယ်။                                                                                                                                         | no                                                                                                                                                                                                         |
| `shell.lang.mode.myOnly` (REWORDED after review) | Burmese only — English stays where a wrong word would stop service                                                                                                                                              | မြန်မာလို သီးသန့် — စာလုံးမှားရင် အလုပ် ရပ်သွားနိုင်တဲ့ နေရာတွေမှာ အင်္ဂလိပ် ကျန်ပါမယ်                                                                                                                           | no (grounded: စာလုံးမှားရင် အလုပ် ရပ်သွား is `pilot.gloss.band.high.why`'s own phrase for the band; the first draft said "only … food or money", which the band — and the language surfaces — made untrue) |
| `shell.lang.mode.both`                           | Burmese, with English on the important words                                                                                                                                                                    | မြန်မာ — အရေးကြီးတဲ့ စာလုံးတွေမှာ အင်္ဂလိပ် ပါ                                                                                                                                                                   | no                                                                                                                                                                                                         |
| `shell.lang.mode.en`                             | English only                                                                                                                                                                                                    | အင်္ဂလိပ်လို သီးသန့်                                                                                                                                                                                             | no                                                                                                                                                                                                         |
| `shell.lang.note`                                | Dish names and kitchen tickets never change with this. A few screens still have English words.                                                                                                                  | ဟင်းနာမည်နဲ့ မီးဖိုချောင် အော်ဒါတွေကတော့ မပြောင်းပါ။ စခရင် တချို့မှာ အင်္ဂလိပ်စာလုံး ကျန်နေသေးပါတယ်။                                                                                                             | no (အော်ဒါ grounded in `kds.a11y.tickets`)                                                                                                                                                                 |
| `pilot.gloss.autonyms` (REWORDED)                | The language names on the language control are not on this sheet, and must not be. Each one names its own language, so correcting one into the other leaves whoever cannot read that language with no way back. | ဘာသာစကား ခလုတ်ပေါ်က ဘာသာစကား အမည်တွေကို ဒီစာရွက်မှာ မထည့်ထားပါ၊ မထည့်သင့်ပါ။ တစ်ခုစီက သူ့ဘာသာစကားကို သူ့ဘာသာနဲ့ ခေါ်တာဖြစ်လို့ တစ်ခုကို တစ်ခုအဖြစ် ပြင်လိုက်ရင် အဲဒီဘာသာစကား မဖတ်တတ်သူ ပြန်ပြောင်းလို့ မရတော့ပါ။ | no                                                                                                                                                                                                         |
| `shell.lang.group` (EN only)                     | This device’s language (was "Console language")                                                                                                                                                                 | စက်၏ ဘာသာစကား (unchanged — no K15 row)                                                                                                                                                                           | no                                                                                                                                                                                                         |

Keys retired: none.

## 7 · Deviations from spec

- **2a's hardening built here, not assumed.** The spec says 2e "lifts" 2a's chain; it was not on disk,
  so `nextLangWrite`/`langChainOutcome` were written generic from the start (their bodies are the
  2a spec's, byte for byte) and the 2a spec's three mutants are among the 34 (plus a fourth,
  `chain-cap-drops-written`). 2a's other items built here: the inset focus ring, the bilingual
  `.staff-bar-msg` alert, the `.staff-bar-msg .chrome-en { color: inherit }` rule, `shell.lang.group`'s
  EN, and the `staff-lang-actions.ts` docblock (the false "a mutant re-adds staffGate" claim replaced by
  the real tripwire; `/board` removed from the control list).
- **Failure line placement.** Profile and Help: the failure line sits directly UNDER the rows, then the
  note (the spec's Section listed note-then-failure; its Help view listed rows-then-failure — one
  order for both, the line next to the tap).
- **A failure the person already SAW is answered by closing the sheet** (`show(false)` clears it too,
  not only `show(true)`): otherwise closing the sheet after reading an in-sheet failure made the same
  line reappear in the bar tail. After review, the close clears ONLY a line the person could see (the
  menu or the Language view): one that landed on How / Text size / Report is kept and said in the
  bar tail — the first cut wiped it unsaid.
- **A tap on the confirmed mode also clears an earlier failure line** (`useLangModeWrite`,
  "same-confirmed"): the person accepted what is set.
- **The Help sheet closes on the provider only while the person is still on the rows** (`onRows` ref):
  a person who closed and re-opened the sheet mid-write, onto another view, is not closed on.
- **The failure line also shows in the Help MENU view** (under the Language row) when the write fails
  after the person stepped Back from the rows — the spec showed it only in the Language view.
- **Focus on the Help view change**: the Language view focuses the PRESSED row on open (the spec's
  `focusOnMount` used for the Help host too — QA §A "focus moved on view change").
- **Both views of More get the Language tile** (the spec's final text; the scope said "the doors'
  More"): the counter's own More list ends with it too.
- **`STAFF_LANG_MODE_KEY`** (the three descriptions) is exported from `StaffLangSwitch.tsx` and read by
  both the rows and the Help row's sub-line — one binding.
- **New keys sit in a `// ── Phase 2e · lang ──` block at the END of `STAFF`** (the BRIEF's shared-file
  rule), not in the language block at the top; a comment there points to it.
- **The accessible-name space test** asserts the Both row's LABEL element's DOM text
  (`"မြန်မာ English"`) as well as the query by name — measured: jsdom's name computation pads element
  boundaries itself, so the name query alone stayed green with the literal space deleted.
- **4d in `check-staff-lang`** also refuses a spread on the bar and a spread inside `leading` (each
  could carry the leading/kind) — the spec named computed and "here".
- **`/staff/login` + `/staff/lock` render test** (`app/staff/front-doors.test.tsx`) added beside the
  static rule 4b, rather than only the static proof.
- **After review — the Text size preview renders through `TicketDishTitle`** (the ticket's own
  dish-title path), not `<Chrome>`: the sample is a dish name, which the spec says never changes with
  the mode. Visible on English devices too (Burmese over English, like the ticket) — the chrome render
  had shown English alone there since P7·3.
- **After review — `check-staff-lang` gained rule 4e** (each control export mounted only by its own
  hosts) and **rule 6 now checks the KEY** (`shell.lang.*`, or StaffDoors' `t.k`). Neither is in the
  spec; both close holes a blind critic reproduced. The header counts THIRTEEN rules.
- **`globals.css`: the Phase 2e additions sit in FIVE places, not one labelled block** (BRIEF
  shared-file rule) — a merge-conflict risk for integration, each placement forced by the cascade or
  by a shared list: (1) the pill/rows block where the old `.staff-lang-btn[aria-disabled]` and
  `.staff-lang-err` rules were (DELETED, not moved — their readers are gone); (2) one selector,
  `.staff-lang-row[aria-pressed="true"]`, in the ONE lit-cap list beside `.kds-chip` (the shared
  selected state must be declared once); (3) `.staff-bar-msg .chrome-en` beside `.staff-bar-msg`;
  (4) `.help-lang` joined to the sheet views' padding rule; (5) `.help-lang-back` joined to
  `.help-size-back`, which must follow `.staff-back` (line ~10570) to win at equal specificity.
- **Mutate set widened** beyond the spec's two files (staff-lang.ts, Chrome.tsx): the hook, the three
  controls' module, HelpButton, StaffDoors and staff-more now carry the rules the scope says each get a
  mutant (§4).

## 8 · Seams for the next wave (2f)

- **No new language control on any bar** — `check-staff-lang` rule **4e** refuses it: the pill may
  be mounted only by the four front doors (from the export that renders each), the rows only by
  `HelpButton`, the card only by the sign-in page — by import identity, from the host's rendering
  export. (The first cut of these notes said 4a and 4c would refuse it; they did not — 4a reads the
  `StaffBar` module alone and 4c allows one host per page, so a page with no Help door could put the
  pill on its own bar and pass. Reproduced on disk against `tips/page.tsx`, then closed by 4e.)
- **`keepEcho` only in the three rule-6 files** (`StaffLangSwitch.tsx`, `HelpButton.tsx`,
  `StaffDoors.tsx`), and only on a language key (a literal `shell.lang.*`, or StaffDoors' `t.k`).
- **The provider stays `{ lang, echoes? }`**; a component reads `useStaffLang()` (script) — never the
  mode — unless it IS a language control (`useStaffLangMode()`).
- **2f's "Unpaid — collect at pickup" strings gate food and money** → give them `// K15-HIGH` markers
  and `STAFF_K15_HIGH` entries, and they keep their English on a Burmese-only device by construction
  (`Chrome.tsx`: `echoes = useEchoesShown() || keepEcho || STAFF_K15_HIGH.has(k)`).
- A new screen with no Help door must lead UP (`leading` absent · screens · back) or rule 4d is red.

## 9 · LEARNINGS candidates

- **A guard that allows "at most ONE host per page" never asked WHICH host.** Rule 4c counted the
  modules a page reaches the control through and stopped at one — so a page with no Help door could
  put the pill on its own bar and read as "hosted". Where the design names the hosts, the guard must
  name them too (4e: by module + export identity, from the host's rendering export), and a
  self-test must include a second export parked INSIDE a legitimate host module.
- **A flag that only matters in one mode needs its tests IN that mode.** `keepEcho` changes nothing
  on an English or Both device (the echo draws anyway), and every language case ran there — so six
  sites could lose it with every suite green. Parametrize over the mode where the flag bites, and
  assert the text exactly (`.chrome-en === STAFF[k].en`), never `toBeTruthy()` on "some element".
- **Radix `aria-hidden`s everything outside an open dialog**, so `getByRole("alert")` can never see
  a second alert BEHIND the sheet — count `document.querySelectorAll('[role="alert"]')` to prove
  "one line". And the sheet's content stays mounted through its exit slide (M76): an in-sheet line
  must be `open &&` or it doubles the bar tail's during the slide.
- **A late `router.refresh()` can land mid-way through the NEXT write.** The provider's mode is then
  older than what the chain knows the server holds; adopt the provider (the cap, `confirmed`) only
  between chains, and cancel any "close when the provider shows X" wait on every new write.

- **Confirmed red-first: React 19 rethrows a rejection from `startTransition(async …)` to the nearest
  error boundary.** The pre-P2e switch (`await setStaffLang(…)` inside an async transition, no
  try/catch) put the test's error boundary on screen instead of the alert (`StaffLangSwitch.test`'s
  "a REJECTED action … throws NOTHING", run against the old component). A transition is not a catch.
  Two more live instances filed above (the Help report send, the approval form).
- **jsdom's accessible-name computation pads element boundaries on its own**: `getByRole(…, { name:
"မြန်မာ English" })` matched two adjacent spans with NO whitespace between them. A test about a
  literal separator in a name must assert the labelling element's DOM text, or it is green for the
  wrong reason.
- **`autonyms.test.ts` reads an own-line comment ABOVE a key as that key's severity marker** — so the
  words "…none is K15-HIGH" in a block comment above a new key MARKED it (the set-equality went red).
  Write about the band without the marker's literal text above a key.
- **A render mode that drops markup must keep the wrapper the CSS is written against** — the one-child
  `.chrome-pair` (pinned by `Chrome.test`'s tree assertion, `StaffBar.test`'s selector-vs-DOM run under
  `echoes={false}`, and the `burmese-only-drops-the-pair` mutant).

## Critic findings — rejected

None. All nine findings of the review were verified against the source and are real; each was fixed
(red-first where it is behaviour) or, for the second half of finding 9 (the `globals.css` spread),
recorded above as the critic asked (§7). Verification, finding by finding:

| #   | Sev | Verified how                                                                                                                                                                    | Resolution                                                                                                                                                                                                                |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | med | The critic's tips probe applied ON DISK: the old guard exited 0 ("5/9 staff pages reach one control module").                                                                   | Rule 4e + 13 self-tests; the same probe now exits 1 naming `tips/page.tsx:91`. Seam text corrected (§8).                                                                                                                  |
| 2   | med | Deleting `keepEcho` at the six named sites together: HelpButton, StaffLangRows and StaffLangSwitch suites all green (105 tests).                                                | Cases re-run under `en` and `my-only` asserting `.chrome-en` exactly; each of the 11 sites, deleted alone, now reddens its suite; 6 mutants (title and Profile line as asked, plus scope, bar-tail, menu and view lines). |
| 3   | med | `STAFF_K15_HIGH` read: `entry.login.denied`, `pin.outage`, `shell.net.offline`, `report.sent` are in the band and gate neither food nor money.                                  | EN + MY reworded to the band's own phrase (K15 draft, grounded on `pilot.gloss.band.high.why`), no "only"; a Chrome test pins the tie; docblocks and these notes follow.                                                  |
| 4   | low | New tests reproduce the scenario (write Both → pick Burmese only → Both's refresh lands): the sheet closed and the tick jumped back; a stale mid-chain mode became `confirmed`. | Four independent pieces, each with its own red test and mutant (tap clears the wait; pick and `confirmed` adopt the provider only between chains; an unwritten chain adopts the provider).                                |
| 5   | low | Dropping `!open &&` left every test green; a failure during the exit slide drew two `role="alert"` lines.                                                                       | In-sheet lines are `open &&`; document-wide `[role="alert"]` counts with the sheet open and during the slide (from the Language view and from the menu); 3 mutants.                                                       |
| 6   | low | A failure landing on How / Report, then Close: no line anywhere (the close's `clearAlert` wiped it).                                                                            | The close clears only a line the person saw; the bar tail says the rest; the OPEN-ITEMS row corrected.                                                                                                                    |
| 7   | low | `<Chrome lang="my" k="kds.title" echo="stack" keepEcho />` added to HelpButton on disk: the old guard stayed clean.                                                             | Rule 6 requires a literal `shell.lang.*` key or StaffDoors' `t.k`; 5 fire self-tests + the StaffDoors canonical near-miss.                                                                                                |
| 8   | low | The size sample went through `<Chrome>`: no `.chrome-en` under Burmese only, English alone under English.                                                                       | Rendered through `TicketDishTitle` in every mode; an `it.each` over the three modes asserts it is byte-identical to the ticket's dish title.                                                                              |
| 9   | low | The `focused` ref is dead (deps `[focusOnMount]`); the rerender case fails only when the deps array is removed (measured). `globals.css`: five placements confirmed.            | Ref deleted, the case kept and its comment says what it pins; the five placements and their cascade reasons listed in §7.                                                                                                 |
