# Phase 2d · bell — build notes

Area: the counter bell (feedback spec "commit A", owner decision 5c, 2026-09-29). Branch `p2d/bell`,
base `2437a78`. Integration merges the sections below into the named docs; this file is not itself a
doc of record.

## 1 · DESIGN-LANGUAGE draft — §17 bullets

- **The counter bell (owner decision 5c).** The counter HOME rings, and nothing else does: a
  `CounterBellProvider` sits inside the counter branch's `LiveConnectionProvider` (`CounterLive` in
  `app/staff/page.tsx`), and a board outside it rings nothing. Two phrases, each opening on a pitch no
  other phrase in the app opens on — **guest** (E6 twice: a table asking to pay at the counter, a
  pickup guest's "I'm here", a scan-and-go basket waiting at the exit check) and **food** (D6 → A5: a
  to-go bag the kitchen finished, not yet bagged, whose guest is not already standing there). A fixed
  0.6 — a working device in a dining room, louder than a guest's phone (0.22), quieter than a hot line
  (0.8); the device's own buttons are the dial. It rings while the tab is hidden for as long as the
  browser keeps the page and its audio running — a hidden tab's polls are throttled, so a ring there
  can lag, and nothing promises instant. No nag: a guest still waiting after the ring gets no second
  bell. Sound is never the only feedback — every event already has its visible half (the floor card's
  status ring and chip; the lane card's ring and its "Here now" / "Kitchen done" badge).
- **A bell rings once per EVENT, never per poll — and never twice per DOCUMENT.** A ring is a fact
  KEY this document has never heard (`lib/counter-attention.ts`): an ask is `ask:{session}:{stamp}`,
  an arrival `here:{order}`, a basket `verify:{order}`, a finished bag `food:{order}`. What the
  counter home has heard is ONE document-scoped set (`counterHeard` / `rememberCounterHeard`,
  `lib/counter-sound.ts` — merge-only, never pruned, never per mount): each board mount's first GOOD
  facts are merged into it silently (the mount, a StrictMode replay, a reload, a lane that mounted
  into an outage — it seeds on its first good poll), and every good poll grows it. So a flap (the
  advisory kitchen read's done → unknown → done, a KDS bump-undo, an ask's counter → paying → counter
  with the same stamp) rings nothing twice, and neither does a REMOUNT whose `initial` is older than
  its last good poll (Back restores the counter home from the App Router's client cache with its
  first load's props; an error boundary's reset; a re-parent). Only a good poll reports; a frozen
  board says nothing, and on recovery only keys never heard ring. One ring per poll (a guest outranks
  food), and the provider refuses the same kind again within `RING_GAP_MS` across both boards (two
  boards on one tick are one bell) — except a guest after food: a person waiting is never swallowed
  by a bag.
- **The bell rings on the counter home and nowhere else — including a poll that lands late.** The
  provider's `ring` returns early once it has unmounted (a mounted ref, re-armed at setup), each board
  keeps an `alive` ref around its ear and its card ring, and the chip keeps a late arm's answer (the
  tap asked for sound) but plays no volume check once it has left: the engine is a document singleton
  that stays armed across the trip to a table, so "the view is gone" must be checked, never assumed.
  Nothing on the ring path reads whether the tab is visible — it rings while hidden.
- **The bell's control is the counter's own chip, not a bar circle** (the KDS rule; a fifth circle
  overflows a 390 manager bar): a `.staff-chip` at the right of the greeting (`.staff-greet-row`,
  counter branch only — the doors' greeting is unchanged), wearing the ONE lit cap through the shared
  pressed list when on. Three postures from two stores (§15 — "wanted" and "armed" are two facts, each
  read through `useSyncExternalStore`, both OFF on the server): **"Turn on sound"** · **"Sound on"**
  (lit) · **"Sound off — tap to turn on"** (warn hairline + ink, `data-muted`: wanted, but the context
  is not running). iOS arms audio only inside a gesture, so the chip's tap IS the arm — started
  synchronously in the handler, raced against `ARM_TIMEOUT_MS` so a resume the browser leaves pending
  never holds the chip busy; on success it plays the guest phrase once (the tap is the volume check)
  and leaves a plain, non-live hint for 8s ("Didn't hear it? Turn up the volume and check this device
  isn't on silent." — device-neutral: most Android phones have no silent switch); a refusal is an
  alert that never blames the volume or silent mode, and it is DROPPED (a guarded set-during-render)
  the moment the context runs — a resume the browser let through after `ARM_TIMEOUT_MS` must never
  leave "tap to try again" beside a lit chip whose tap mutes. Both lines FLOAT under the chip
  (`.staff-sound-line`: absolute from the relative `.staff-greet-row`, the chip's `--sf` ground with
  `--sh-md`, under the sticky bar, `pointer-events: none`, `.mms-rise` in) — in the flow they pushed
  the whole counter column down a line and pulled it back 8s later, under a finger. Only the chip's
  own tap takes its lock (aria-busy + aria-disabled, label kept). While PAUSED, the next click or key
  anywhere else — or the tab coming back into view — re-arms SILENTLY and lock-free. The arm asks for
  WebKit's `playback` audio session where it exists, so an iPad's silent switch does not mute the bell
  (the chip is the counter's mute). The engine is a module singleton, so the arm survives the soft trip
  to a table page and back; a reload loses it and the chip says so.
- **One word per action on every sound chip.** The KDS, the TV and the counter share the OFF word —
  "Turn on sound" (`kds.sound.enable`, `board.sound`), the same "turn on" the paused posture says —
  and plain-words bans "enable" (settings-speak).
- **One "just changed" ring on the counter screen.** A lane card the bell rang for wears the floor
  card's own `.floor-card-pulse` (keyed per event, cleared on its own timer, RM → none) — never a
  third ring class. It shows whether or not the bell is on.

## 2 · CHANGELOG

- **The counter bell (Phase 2d · bell).** The counter home now rings — once per event, never twice —
  for a guest (a table asking to pay at the counter, "I'm here", a scan-and-go basket at the exit) and
  for food (a to-go bag the kitchen finished), at a fixed 0.6 with the `playback` audio session so the
  iPad's silent switch does not mute it. A chip beside the greeting arms it with one tap (and plays it
  once, as the volume check), says "Sound off — tap to turn on" when a slept tablet lost it and
  re-arms silently off the next tap; the lane card the bell rang for takes the floor's one-shot ring.
  What the counter home has heard is document-scoped, so a trip into a table and Back never re-rings,
  and a poll that lands after the counter home was left rings nothing. Every sound chip (KDS, TV,
  counter) now says "Turn on sound", never "Enable sound". Rules in `lib/counter-attention.ts` /
  `lib/counter-chime.ts`, plumbing in `lib/counter-sound.ts`, the provider + chip in
  `components/staff/CounterBell.tsx`; 32 new mutants, all killed. Also fixed: the floor board never
  refreshed under React StrictMode (dev) — its `alive` latch is re-armed at setup.

## 3 · OPEN-ITEMS rows

| Sev | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why / where                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| med | **Device-only: the counter bell's audio is unmeasured on every real device.** No device here. Owed on the counter iPad and an Android phone: (a) the chip's tap arms inside the gesture and the guest phrase plays; (b) with the ringer switch on SILENT the bell still rings where `navigator.audioSession` exists (iPadOS Safari), and on a browser without it the post-arm hint is the only cover; (c) a hidden tab: Chrome throttles a background tab's timers (a ring can lag up to a minute), iOS Safari suspends a backgrounded page and its audio — "rings while hidden" holds only where the page keeps running; (d) after a call / Siri the context reads `interrupted` (P2bw's shape, now on the counter too) — confirm the chip goes to "Sound off — tap to turn on" and one tap re-arms it; (e) 0.6 is audible over a full dining room and not startling at a quiet table. | Phase 2d · bell — `lib/counter-sound.ts` (`armWithin`, `playbackSession`), `components/staff/CounterBell.tsx`. The owner accepted (decision 5c) that on audio-session devices the switch no longer silences the bell and it may pause other audio playing on the counter iPad. |
| low | **The counter bell's starting constants are unmeasured.** `RING_GAP_MS` 2000 (`lib/counter-attention.ts`), `ARM_TIMEOUT_MS` 1500, `COUNTER_LEVEL` 0.6 and `SOUND_HINT_MS` 8000 (`lib/counter-chime.ts`) are the spec's starting values; `LANE_PULSE_MS` 1100 (`ExpoBoard.tsx`) copies the floor board's own ring lifetime.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Phase 2d · bell — measure on the counter iPad during a real rush (the ARM timeout on a slow iPad's first resume; whether two rings 2s apart read as one burst or two).                                                                                                         |
| low | **The help call (v7.2 `waiterBell`) cannot ring — no diner "call staff" signal exists.** Grepping `call-staff` / `service-request` / `help-call` in `apps/qr` and `supabase/migrations` returns nothing. Needs its own diner slice: a write path, RLS, a per-seat rate limit, clear-on-answer; then it plugs into `counterRing` as a third guest fact (`floorFacts` or its own board). Nothing claims one today, and the Help sheet must never say a table can call the counter.                                                                                                                                                                                                                                                                                                                                                                                                        | Phase 2d · bell (feedback spec, out of scope). Until then tables flag staff by hand.                                                                                                                                                                                           |
| low | **A console-wide bell.** The bell rings on the counter HOME only (owner decision 5c): someone on `/staff/table/7` hears nothing until they come back. An event that happened while they were away and is still on the board rings ONCE on return when the page is restored by Back (its `initial` predates the event, and this document never heard it), and seeds silently when the page is fetched fresh (a Link, a reload) — never twice either way (`counterHeard`). A console-wide bell needs a new staff poll on every page.                                                                                                                                                                                                                                                                                                                                                      | Phase 2d · bell (out of scope). `CounterBellProvider` is the seam: mount it higher and give the other pages an ear.                                                                                                                                                            |
| low | **A Help card explaining the counter bell.** The counter's Help sheet does not mention the chip, the two phrases or the paused posture. It is its own slice (the sheet's revision bump and `HelpPicture`), and it must never claim a table can call the counter (no help call exists).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase 2d · bell (out of scope).                                                                                                                                                                                                                                                |
| low | **Fresh pay-at-counter asks are not ANNOUNCED to screen-reader staff.** The bell is sound, the floor card's ring is visual, and the floor's one region speaks counts, not asks. Announcing "Table 7 wants to pay at the counter" through that region (deduped, one per ask) is its own change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 2d · bell (feedback spec, out of scope). `FloorBoard.tsx` — `hear()` already returns the fresh keys per poll.                                                                                                                                                            |
| low | **A "jump to it" pill for an off-screen ask or arrival.** On a phone the card the bell rang for may be scrolled far below; the ring shows only where the card is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 2d · bell (out of scope).                                                                                                                                                                                                                                                |
| low | **Watch the scan-and-go ring in a grocery rush.** The guest ring for a basket waiting at the exit check equals the market's basket count. If a rush makes it chatty, drop that one fact (one line in `laneFacts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phase 2d · bell (owner decision 5c trade-off).                                                                                                                                                                                                                                 |
| low | **Sound chips rename themselves with their state.** The counter chip (like the TV's board-4 chip it follows) reads "Turn on sound" / "Sound on" / "Sound off — tap to turn on" while also carrying `aria-pressed`, so the accessible name changes when pressed. A constant name ("Sound") with the state in `aria-pressed` and a visible sub-word is the stricter pattern; changing it touches the KDS, the TV and the counter together.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase 2d · bell — `CounterBell.tsx`, `ReadyBoard.tsx`, `KdsBoard.tsx`. Recorded, not built.                                                                                                                                                                                    |
| low | **The floating sound note is unmeasured in a browser.** `.staff-sound-line` now floats under the chip (absolute, `--sf` + `--sh-md`, under the sticky bar, `pointer-events: none`) instead of reflowing the counter column. No browser here: owed at 390 (the chip wrapped under the greeting, the refusal wrapping to two lines inside the note) and at 768/1024 (a one-line note over the Start zone's top edge), in both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Phase 2d · bell (critic finding 5) — `app/globals.css` `/* ── Phase 2d · bell ── */`.                                                                                                                                                                                          |
| low | **Back-restores-from-the-router-cache is reasoned, not run.** The document-level heard set was built because the App Router restores a back/forward navigation from its client cache (the counter home returns with its first load's props and its boards remount — no `cacheComponents` in `next.config.ts`). The fix holds whatever `initial` a remount carries; the router behaviour itself is owed a browser check (Back from `/staff/table/7` on the counter device: no second ring for an ask already rung).                                                                                                                                                                                                                                                                                                                                                                      | Phase 2d · bell (critic finding 1, PLAUSIBLE) — `lib/counter-sound.ts` `counterHeard`.                                                                                                                                                                                         |

Existing rows this work touches (none CLOSED):

- **P2bh** (KDS audio-session / silent-switch parity; the KDS chip fully on `useSyncExternalStore`) —
  unchanged and still open: the counter bell ships the `playback` session and the
  `useSyncExternalStore` posture for the COUNTER only; the kitchen chip is untouched here. The
  counter's code (`lib/counter-sound.ts` `playbackSession`, `CounterBell.tsx` `useSoundPosture`) is
  the pattern to lift.
- **P2bw** (Safari's `interrupted` context) — now applies to the counter chip too; folded into the
  device-only row above, item (d).
- **P2bi** (staff tablets never activate new builds) — unchanged; the bell ships to a tablet only when
  its tab is reloaded.

## 4 · Mutate-set / CLAUDE.md enumeration changes

Files JOINING the verify:slice mutate set (their first mutants):

| File                                       | Bucket    |
| ------------------------------------------ | --------- |
| `apps/qr/lib/counter-attention.ts`         | lib       |
| `apps/qr/lib/counter-chime.ts`             | lib       |
| `apps/qr/lib/counter-sound.ts`             | lib       |
| `apps/qr/components/staff/CounterBell.tsx` | component |

Measured at this branch's head with CLAUDE.md's own greps: **141 lib + 3 api + 22 components + 1 db =
167 files**, **1151 mutants** (base `2437a78`: 1119 → +32). CLAUDE.md's component list gains
`staff/CounterBell.tsx` (Phase 2d · bell).

Mutants added (32, one block `// ── Phase 2d · bell ──` at the end of the array), each KILLED by a
targeted `verify:slice --no-gate --only=<prefix>` run:

- `counter-attention/…` (suite `lib/counter-attention.test.ts`): `a-mount-rings`,
  `the-seen-set-forgets`, `food-rings-for-an-arrived-guest`, `an-unknown-kitchen-rings-food`,
  `a-verified-basket-is-a-guest`, `an-arrival-never-rings`, `a-paying-table-rings`,
  `the-ask-forgets-its-stamp`, `food-outranks-a-waiting-guest`, `the-gap-is-inclusive`,
  `a-bag-bell-swallows-a-guest`, `the-exemption-is-symmetric`.
- `counter-chime/…` (suite `lib/counter-chime.test.ts`): `paused-reads-as-on`,
  `an-unwanted-bell-rings`, `a-paused-tap-mutes`, `the-counter-as-loud-as-the-kitchen`.
- `counter-sound/…` (suite `lib/counter-sound.test.ts`): `the-arm-has-no-timeout`,
  `the-silent-switch-mutes-the-bell`, `a-broken-store-is-consent`, `a-refused-write-snaps-back`,
  `the-heard-set-forgets` (critic round).
- `counter-bell/…` (suite `components/staff/counter-boards.test.tsx` for
  `the-bell-ignores-the-posture`, `the-bell-never-coalesces`, `a-seed-rings`, `a-hidden-tab-is-silent`;
  `components/staff/CounterBell.test.tsx` for the rest): `the-re-arm-plays-the-tone`,
  `the-chip-tap-arms-twice`, `the-tab-return-never-re-arms`, `the-chip-stays-busy`, and (critic
  round) `the-bell-rings-after-the-counter-left`, `the-check-tone-follows-the-counter-out`,
  `a-late-arm-keeps-the-refusal`.

Mutants re-anchored (critic round): `counter-bell/a-seed-rings` — the seed moved from a lazy state
initializer into the ear's first `hear` (`rememberCounterHeard(counterRing(null, base).seen)`); same
meaning, "seeded empty". Re-verified after the critic round: all 11 `counter-bell/` and all 5
`counter-sound/` mutants KILLED (the `counter-attention/` and `counter-chime/` files did not change).
`FloorBoard.tsx` and `ExpoBoard.tsx` are NOT in the mutate set (their bell wiring is pinned by
`counter-boards.test.tsx`, each case watched red by hand — see §7).

## 5 · Owner-visible behaviour changes

- The counter home (`/staff` on a counter device) has a sound chip at the right of the greeting:
  **Turn on sound** → one tap arms the bell and plays it once so the counter can check the volume,
  with a one-line note under the chip about the volume and silent mode (it floats over the page for
  8s; nothing below it moves). **Sound on** is lit; a tap mutes.
  **Sound off — tap to turn on** (warn) means the device wanted the bell but lost it (a reload, a
  slept tablet, a call); the next tap anywhere brings it back without a sound.
- The counter hears a **guest** bell when a table asks to pay at the counter, a pickup guest taps
  "I'm here", or a scan-and-go basket arrives at the exit check — and a **food** bell when the kitchen
  finishes a to-go bag. Once per event; one bell per kind per two seconds across both boards; no
  bell for anything already on screen when the page opened; never a second bell for the same guest.
- The takeaway card the bell rang for flashes the floor card's one-shot ring (with the bell on or off).
- The doors screen, the table pages and the kitchen board have no bell — including a counter poll that
  was still on its way when someone tapped into a table.
- A trip into a table and Back never rings again for anything the bell already rang for.
- **The kitchen's and the TV's sound chip now say "Turn on sound"** (was "Enable sound"); Burmese
  unchanged.
- Development only: the floor board now refreshes under React StrictMode (it silently stopped after
  mount in `pnpm dev`).

## 6 · K15 strings

New (both Claude-authored K15 drafts pending Min's native check; neither gates food or money, so
neither is K15-HIGH and `STAFF_K15_HIGH` is unchanged):

| Key                   | EN                                                                        | MY                                                     | HIGH? |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ----- |
| `floor.sound.hint`    | Didn’t hear it? Turn up the volume and check this device isn’t on silent. | မကြားရဘူးလား — အသံ တိုးပြီး ဒီစက် အသံပိတ်ထားလား စစ်ပါ။ | no    |
| `floor.sound.refused` | Sound didn’t start on this device — tap to try again.                     | ဒီစက်မှာ အသံ မစနိုင်ပါ — ထပ်နှိပ်ကြည့်ပါ။              | no    |

`floor.sound.hint` is a critic-round re-draft (device-neutral: the first draft named the silent
SWITCH, which most Android phones do not have); its MY is a new K15 draft.

Reused (grounded, not new): `kds.sound.enable`, `board.sound.on`, `kds.sound.off`. **English changed,
Burmese unchanged:** `kds.sound.enable` and `board.sound` "Enable sound" → "Turn on sound" (the KDS,
the TV and the counter chip together — one word per action; the MY `အသံ ဖွင့်` already said "turn
on"). Retired: none.

## 7 · Deviations from spec

- **`useCounterAttention` instead of a hand-written `seenRef` in each board.** The spec's [19]/[20]
  put `seenRef` + `counterRing` + `bell?.ring` inline in FloorBoard and ExpoBoard. One hook in
  `CounterBell.tsx` owns the seen set for both (seeded once through a lazy state initializer, so a
  StrictMode double render seeds the same set; written only from the poll's callback), and each board
  calls `hear(facts)` on a GOOD poll. Same semantics, one implementation, and FloorBoard's hunk shrinks
  to four lines (floor edits that file in parallel). `useCounterBell()` is therefore not exported: the
  hook reads the context itself and rings nothing outside the provider.
- **`CounterLive` in `page.tsx`.** The spec wraps the counter content in `<CounterBellProvider>` inside
  `<LiveConnectionProvider>`. A literal wrapper re-indents the whole counter branch — the lines the
  floor area re-wraps with `CounterMintProvider` — so the two providers are composed once in a small
  `CounterLive` component at the end of `page.tsx` (nesting unchanged: LiveConnectionProvider >
  CounterBellProvider), and the branch swaps only its open/close tags. The greeting row is built in
  the `greeting` const (the counter view's arm), so the zone lines are untouched too.
- **The chip reads `useStaffLang()`** rather than taking `lang` as a prop (`<CounterSoundChip lang/>`
  in the spec) — the boards' own idiom; the counter branch always sits under the staff layout's
  `StaffLangProvider`.
- **Lane pulse lifetime 1100ms, not 1000.** The spec says "cleared after 1000 ms"; the floor board
  clears its identical ring at 1100 (the 1s keyframes plus slack, so the ring always finishes before
  the unmount). The lane copies the floor's number (`LANE_PULSE_MS`, commented) — one idiom, one
  lifetime.
- **ExpoBoard.test re-scope [21] was already done in 2b** (`within(article)` for every `/^Undo/`
  lookup). The spec's "ExpoBoard.test.tsx with a fake bell" cases live in `counter-boards.test.tsx`
  instead, under the REAL provider over a fake AudioContext (a fake bell would not have exercised
  `mayRing` or the posture gate).
- **Found and fixed outside the spec: FloorBoard's `alive` latch.** The poll effect's cleanup set
  `alive.current = false` and nothing re-armed it, so under React StrictMode (on in `next.config`)
  every poll after mount returned early — in dev the floor never refreshed and its bell could never
  ring. Re-armed at setup (the `usePadDetailLive` / `FloorDetailLive` pattern). Red first: the
  StrictMode case in `counter-boards.test.tsx` failed before the fix.
- **Red-first by hand for the board wiring (outside the mutate set):** seeding the lane from its empty
  outage placeholder → the "mounted INTO an outage" case red; dropping FloorBoard's `hear(…)` → the
  mount and StrictMode cases red; dropping the lane card's pulse span → the pulse case red. Each
  restored byte-identical.
- **Contrast.** `--warn` on `--sf` (the paused chip) is newly pinned in `contrast-audit.test.ts`,
  both themes (watched red by pointing the pair at plain `--ac`). Since the critic round the hint and
  the refusal float on the chip's own `--sf`: `t2 on sf` was already pinned, and the refusal is this
  same `warn on sf` pair.
- **No `.staff-press` on the chip** — `.staff-chip` carries its own rest/pressed/aria-disabled rules
  and no other `.staff-chip` toggle on the console presses it.

- **Critic round — the hint's copy departs from the spec's verbatim string** ("Check the volume and
  the silent switch."): device-neutral instead, since an Android counter phone has no silent switch.
- **Critic round — `kds.sound.enable` / `board.sound` renamed** although the spec reuses "Enable
  sound" verbatim: the brief's one-word-per-concept and plain-words rules outrank a reused string, and
  the rename is one value per key (the KDS and TV chips change with the counter's).
- **Critic round — the hint and refusal float** (absolute under the chip) where the spec says "a plain
  hint line sits under the chip": the spec's own risk note says the counter's boards must not move
  under a finger, and an in-flow line moved the whole column for 8s.
- **Critic round — the bell's seen set is document-scoped**, where the spec says "a per-mount seen set
  seeded on mount": per-mount re-rang on every remount carrying a stale `initial`. The mount still
  seeds (silently); the set it seeds is the document's.
- **Test ids are fresh per case in `counter-boards.test.tsx`'s bell block**: the heard set is
  document-scoped by design, and one test file is one document.

## 8 · Seams for the next wave

- **Tablet split (wave 2).** The provider stack the plan names is `LiveConnectionProvider >
CounterBellProvider > StaffBar + greet row + CounterSplit`: `CounterLive` (`app/staff/page.tsx`,
  bottom of file) is exactly the first two, so CounterSplit goes INSIDE its children beside `{header}`
  and `{greeting}` — no change to the bell. The table pane (the FloorDetailLive `variant="pane"`) must
  NOT mount a second provider: the bell is the counter home's, and a pane inside the split is still
  on the counter home, so it rings through the one provider above it (it has no ear of its own).
  **The split should not remount FloorBoard / ExpoBoard across a breakpoint** (rotating the iPad): a
  remount no longer re-rings (the heard set is document-scoped) and a late poll no longer rings (the
  `alive` / `mounted` guards), but it still drops the lane's open picked-up windows and restarts both
  boards' polls — keep one tree and move it with CSS where possible.
- **A console-wide bell / the help call.** `useCounterAttention(seed)` (`components/staff/CounterBell.tsx`)
  is the ear any board can take; a new fact kind is one more key in `floorFacts` / `laneFacts`
  (`lib/counter-attention.ts`) and one entry in `COUNTER_TONES` (`lib/counter-chime.ts`).
- **KDS parity (P2bh).** `lib/counter-sound.ts` `playbackSession()` and `CounterBell.tsx`
  `useSoundPosture()` are the two pieces to lift into `kds-sound.ts` / `KdsBoard.tsx`.

## 9 · LEARNINGS candidates

- **A mutable singleton engine shared across a test file's cases needs RELATIVE assertions.** The
  counter engine is a module singleton by design (the arm survives a soft navigation), so its fake
  context — and its resume count — outlive each test; `expect(resumed).toBe(1)` passed only for the
  first test in the file. Assert `before + 1`, and reset the context's state (not the module) in
  `beforeEach`. `vi.resetModules()` is not the answer for a component suite: it re-imports React
  under the component while testing-library keeps the old one.
- **A realtime subscribe triggers a catch-up read ~400ms after mount.** Any board test that sets the
  next poll's answer BEFORE the first tick has that answer read at 400ms, not at the 5s poll — a
  one-shot visual that clears after ~1s is gone by the 5s tick. Settle one tick first, then change
  the answer.
- **An `autonyms` marker is matched in COMMENTS above an entry.** A comment that merely says "neither
  is K15-HIGH" above two dictionary entries marks them HIGH to `autonyms.test.ts`; phrase it without
  the token.
- **Back restores the App Router page from its client cache with the FIRST load's props** (no
  `cacheComponents` here, so the tree remounts). Any per-mount memory seeded from a server `initial`
  — a seen set, a "last announced" value — is re-seeded with stale data on Back; memory that must not
  repeat itself belongs at document scope.
- **Defence in depth makes each layer's mutant survive a whole-path test.** With both the provider's
  `mounted` guard and ExpoBoard's `alive` guard, a "counter home unmounts mid-poll" case stays green
  when either is removed. Each layer needs a case that bypasses the others (a lane unmounting under a
  LIVE provider; a bare ear calling `hear` after the provider left).

## 10 · Critic findings

All six were verified against the code and are real; each is fixed, red-first against the previous
head (`109af21`):

| #   | Sev | Finding                                                                        | Fixed in  | Pinned by                                                                                                                                                                                                                                                                                                                           |
| --- | --- | ------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | med | A remount with a stale `initial` re-rang facts an earlier mount rang for       | `f29f6d5` | counter-boards "a REMOUNT carrying the page's first snapshot…"; counter-sound "every remember ADDS…"; mutant `counter-sound/the-heard-set-forgets`                                                                                                                                                                                  |
| 2   | low | A lane poll / chip arm landing after unmount rang on the table page            | `f29f6d5` | counter-boards "a lane poll that lands after the counter home was left…" and "a lane that unmounts under a LIVE provider…"; CounterBell "an arm that answers after the chip LEFT…" and "a ring that lands after the provider unmounted…"; mutants `the-bell-rings-after-the-counter-left`, `the-check-tone-follows-the-counter-out` |
| 3   | low | A late resume left "tap to try again" beside a lit chip                        | `f29f6d5` | CounterBell "a resume that lands AFTER the timeout drops the refusal…" (+ the OFF case); mutant `a-late-arm-keeps-the-refusal`                                                                                                                                                                                                      |
| 4   | low | No test pinned "rings while the tab is hidden"                                 | `f29f6d5` | counter-boards "rings while the tab is HIDDEN…" (watched red against an induced `document.hidden` gate); mutant `a-hidden-tab-is-silent`                                                                                                                                                                                            |
| 5   | low | The hint/refusal line reflowed the counter column for 8s                       | `f29f6d5` | CSS only (no layout engine here) — OPEN-ITEMS row for the 390/768 browser check                                                                                                                                                                                                                                                     |
| 6   | low | "Enable sound" vs "tap to turn on"; an Android phone sent to a "silent switch" | `e2a22fe` | plain-words bans "enable" (watched red on the old values); the hint re-drafted device-neutral                                                                                                                                                                                                                                       |

Mutants for the fixes: `76930b9`.

### Critic findings — rejected

None. Finding 1's router-cache mechanism was not run in a browser (the critic marked it PLAUSIBLE);
the fix holds for any remount with a stale `initial` (an error-boundary reset reaches the same path),
and the browser check is filed as an OPEN-ITEMS row.
