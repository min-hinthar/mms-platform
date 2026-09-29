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
  `.x > .chrome-pair > [lang="my"]`); no middot, no `.chrome-en`. A key in `STAFF_K15_HIGH` keeps its
  English line whatever the device (the shared kitchen tablet's cross-check — Dad's line — under Mark
  sold out, Done, Cook now and the money words), so adding a `// K15-HIGH` marker is a display change
  too. `keepEcho` is confined by `check-staff-lang` rule 6 to three files, a literal `lang="my"` and a
  literal echo. The KDS ticket (`TicketText`), dish names and the P2m/K25 English never change with
  the mode, and the note under the rows says so. No provider (the wall TV) keeps every echo.
- **One write chain, host-owned (`useLangModeWrite`).** The in-flight guard is a REF read at tap
  time; a tap while a write is out only replaces the intent, and the writes serialize so the LAST
  pick wins (§4.2) with ONE refresh at the end; the cap moves at the tap and snaps back to the
  CONFIRMED mode on every failure (§4.4); every write is `raceTimeout(…, 15 000)` inside try/catch,
  so a refusal, a rejected Server Action and a hang all end as the failure line — never the error
  boundary. Nothing is ever `disabled` or `aria-disabled` (the control never refuses a tap); the
  group says `aria-busy` and the pending cap dims (§17's busy dim). The Lock circle REFUSES
  re-entry — a lock is not a choice you correct mid-flight; the language controls never do.
- **A language write never makes a Sheet `busy`** (M82 is for irreversible writes): ✕, Escape, the
  scrim and the drag stay live, and the Help host owns the write so closing never cancels it. A tap
  on the confirmed mode closes the sheet (like the size rows); a tap on another stays open until the
  PROVIDER shows the written mode — the board behind is already in the new tongue as the sheet
  slides away; a second tap on the pending mode does nothing. A failure lands in the sheet while it
  is open (`role="alert"`, both tongues) and as the bar tail's `.staff-bar-msg` line beside the ?
  circle if the person closed the sheet first — only one ever renders, and the next open or close
  answers it. The Profile's failure speaks through the view's ONE region (`ViewStatusProvider`) with
  its visible line `aria-hidden`.
- **The front-door pill writes a MODE**, resolved against the confirmed mode at tap time: the script
  the device already reads keeps its mode (a Burmese-only device stays Burmese-only, and a brushed
  "English" corrected mid-write returns to it); from a confirmed English device, မြန်မာ restores the
  default, Both. Its focus ring is drawn INSIDE each segment (`outline-offset: -3px`, pill-shaped) —
  the pill's `overflow: hidden` clipped the global +2px ring (xcut-2's language third).

### §6 (one sentence)

- A device may drop the chrome's English echoes (Burmese only) except on the food-and-money band;
  the pair stays, and dish names and the kitchen ticket never change with the device.

## 2 · CHANGELOG

- **P2e — the staff language, three ways, per device.** Burmese only · Both · English, per device
  (Both = the old Burmese exactly; no device changes on deploy; rollback-safe). The pill leaves every
  in-service bar and stays on the four front doors (sign-in, lock, outage, error); the Profile gets a
  language card, the kitchen and counter Help sheet a Language row, the doors' More a last Language
  tile — each in both scripts on every device. Burmese only drops the English echoes except on the
  K15-HIGH food-and-money words. One hardened write chain behind all of them (a rejected or hung
  write is a bilingual line, never the error screen; latest pick wins; the cap moves at the tap and
  reverts to what the server holds). No one-time notice (owner decision pending). No SQL.

## 3 · OPEN-ITEMS rows

| Sev   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why / where                                                                                                                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | **CLOSES P2x** ("The staff language becomes a three-way Burmese / Both / English per-device setting in Profile (slice 2e …)", `planned:2e`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence: `lib/staff-lang.ts` (modes, parse, `scriptOf`/`echoesShown`/`modeOf`/`modeForScript`), `StaffLangSwitch.tsx` (pill · rows · Profile card), `HelpButton.tsx` (Language row), `lib/staff-more.ts` (tile), `StaffBar.tsx` (no control), `check-staff-lang` 4a–4d + 6, 34 KILLED mutants. |
| owner | **One-time relocation notice?** Built with none (the spec's recommendation). The approved 2026-09-24 recommendation included a `HELP_SHEET_REVISION` bump for kitchen + counter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Trade-off: someone reaching for the old bar pill mid-service on the kitchen board finds it only through Help, untold. Cheapest honest form: bump the revision (one constant; the decks re-open once per device).                                                                                |
| owner | **Burmese only keeps the K15-HIGH English** (built as YES — the spec's owner question 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Dropping it on a device nobody else reads is a one-line change in `Chrome.tsx` (the `STAFF_K15_HIGH.has(k)` term); the row description ("English stays only where a wrong word costs food or money") would change with it.                                                                      |
| low   | **Composite accessible names under Burmese only are contained piecewise, not contiguously** (WCAG 2.5.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `CounterOrderCard` `subjectOf`, `RefundsNeededStrip`: names keep the English echo between Burmese pieces while the screen drops it. Per-key containment holds (stated in `lib/staff-labels.ts`); no AT users on these tablets.                                                                  |
| low   | **K37 grows**: `EntrySkeleton` now draws the front door's 152px PILL in the tail (the form and lock shapes), but the SIGNED-IN `/staff/login` lands without it (its bar carries Lock) and one card taller (the language card).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `components/staff/EntrySkeleton.tsx` docblock states the limit; the neutral-shape option already filed on K37.                                                                                                                                                                                  |
| med   | **The Help sheet's REPORT send awaits a Server Action inside `startTransition(async …)` with no try/catch** (`HelpButton.tsx` `send()`), and so does the manager approval form (`ApprovalsBoard.tsx` ~:403).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P2e's red-first CONFIRMED the mechanism (§9): under React 19 a rejection there is rethrown to the nearest error boundary — the whole board. Same fix as the language chain: try/catch the await (or LockButton's plain async handler). Not taken here — 2e does not touch the report send.      |
| low   | **A language failure that lands while the Help sheet is on the How / Text size / Report view is not shown until the person returns to the menu or the Language view.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `HelpButton.tsx`: the in-sheet line renders in the menu and Language views; the bar-tail line only while the sheet is closed. A rare path (step away mid-write into another view); the chain still reverts the cap.                                                                             |
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
- `grep -cE '^\s+id: "' scripts/verify-slice.mjs` → **1305** (base 1271; +34).

Files JOINING the mutate set (5):

| Path                                           | Bucket                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `apps/qr/components/staff/useLangModeWrite.ts` | component (a HOOK under components/, like `useStaffSend.ts`) |
| `apps/qr/components/staff/StaffLangSwitch.tsx` | component                                                    |
| `apps/qr/components/staff/HelpButton.tsx`      | component                                                    |
| `apps/qr/components/staff/StaffDoors.tsx`      | component                                                    |
| `apps/qr/lib/staff-more.ts`                    | lib                                                          |

(`lib/staff-lang.ts` and `components/staff/Chrome.tsx` were already in the set.)

Mutants added (34, block `// ── Phase 2e · lang ──` at the end of `MUTANTS`), all **KILLED** by
`node scripts/verify-slice.mjs --no-gate --only=p2e-lang`:

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

Re-anchored (1): **`chrome/burmese-half-dropped`** — its find now spans `{my}` + the new
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
  wrong word costs food or money (Mark sold out, Done, Cook now, Undo, the cash and payment words,
  the outage instructions), which keep their English for whoever else reads the kitchen tablet. The
  kitchen ticket and dish names do not change at all.
- Nothing changes for any device on deploy: "Both" is exactly today's Burmese.
- A language change that fails (offline, a stale tab after a deploy, a hung connection after 15 s)
  now says so in **both** Burmese and English beneath the controls and puts the choice back — it can
  no longer replace the whole board with the error screen. A quick mis-tap corrected at once is
  written in order and the screen redraws once.
- The keyboard focus ring on the front doors' pill is now fully visible (drawn inside the pill).

## 6 · K15 strings

Every MY below is a Claude-authored draft pending Min's native check; none is K15-HIGH.

| Key                               | EN                                                                                                                                                                                                              | MY                                                                                                                                                                                                               | HIGH?                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `shell.lang.row`                  | Language                                                                                                                                                                                                        | ဘာသာစကား                                                                                                                                                                                                         | no (grounded: the word inside `shell.lang.group`) |
| `shell.lang.scope`                | Only this device changes — every tablet and phone keeps its own.                                                                                                                                                | ဒီစက်ပဲ ပြောင်းပါမယ် — တက်ဘလက်နဲ့ ဖုန်း တစ်ခုစီက ကိုယ့်ဟာကိုယ် ထားပါတယ်။                                                                                                                                         | no                                                |
| `shell.lang.mode.myOnly`          | Burmese only — English stays only where a wrong word costs food or money                                                                                                                                        | မြန်မာလို သီးသန့် — အစားအစာ ဒါမှမဟုတ် ငွေ ထိခိုက်နိုင်တဲ့ စာလုံးတွေမှာပဲ အင်္ဂလိပ် ကျန်ပါမယ်                                                                                                                     | no                                                |
| `shell.lang.mode.both`            | Burmese, with English on the important words                                                                                                                                                                    | မြန်မာ — အရေးကြီးတဲ့ စာလုံးတွေမှာ အင်္ဂလိပ် ပါ                                                                                                                                                                   | no                                                |
| `shell.lang.mode.en`              | English only                                                                                                                                                                                                    | အင်္ဂလိပ်လို သီးသန့်                                                                                                                                                                                             | no                                                |
| `shell.lang.note`                 | Dish names and kitchen tickets never change with this. A few screens still have English words.                                                                                                                  | ဟင်းနာမည်နဲ့ မီးဖိုချောင် အော်ဒါတွေကတော့ မပြောင်းပါ။ စခရင် တချို့မှာ အင်္ဂလိပ်စာလုံး ကျန်နေသေးပါတယ်။                                                                                                             | no (အော်ဒါ grounded in `kds.a11y.tickets`)        |
| `pilot.gloss.autonyms` (REWORDED) | The language names on the language control are not on this sheet, and must not be. Each one names its own language, so correcting one into the other leaves whoever cannot read that language with no way back. | ဘာသာစကား ခလုတ်ပေါ်က ဘာသာစကား အမည်တွေကို ဒီစာရွက်မှာ မထည့်ထားပါ၊ မထည့်သင့်ပါ။ တစ်ခုစီက သူ့ဘာသာစကားကို သူ့ဘာသာနဲ့ ခေါ်တာဖြစ်လို့ တစ်ခုကို တစ်ခုအဖြစ် ပြင်လိုက်ရင် အဲဒီဘာသာစကား မဖတ်တတ်သူ ပြန်ပြောင်းလို့ မရတော့ပါ။ | no                                                |
| `shell.lang.group` (EN only)      | This device’s language (was "Console language")                                                                                                                                                                 | စက်၏ ဘာသာစကား (unchanged — no K15 row)                                                                                                                                                                           | no                                                |

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
  line reappear in the bar tail. The bar-tail line therefore shows only for a failure that lands while
  the sheet is closed — the spec's stated intent.
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
- **Mutate set widened** beyond the spec's two files (staff-lang.ts, Chrome.tsx): the hook, the three
  controls' module, HelpButton, StaffDoors and staff-more now carry the rules the scope says each get a
  mutant (§4).

## 8 · Seams for the next wave (2f)

- **No new language control on any bar** — `check-staff-lang` rule 4a (`StaffBar` reaches none) and 4c
  (one hosting module per page) will refuse it.
- **`keepEcho` only in the three rule-6 files** (`StaffLangSwitch.tsx`, `HelpButton.tsx`,
  `StaffDoors.tsx`).
- **The provider stays `{ lang, echoes? }`**; a component reads `useStaffLang()` (script) — never the
  mode — unless it IS a language control (`useStaffLangMode()`).
- **2f's "Unpaid — collect at pickup" strings gate food and money** → give them `// K15-HIGH` markers
  and `STAFF_K15_HIGH` entries, and they keep their English on a Burmese-only device by construction
  (`Chrome.tsx`: `echoes = useEchoesShown() || keepEcho || STAFF_K15_HIGH.has(k)`).
- A new screen with no Help door must lead UP (`leading` absent · screens · back) or rule 4d is red.

## 9 · LEARNINGS candidates

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
