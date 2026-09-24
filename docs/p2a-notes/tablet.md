# Phase 2a · tablet — notes for integration

Scope: tablet-split COMMIT 1 (four standalone console fixes) + COMMIT 2 (`FloorDetailLive.test.tsx`,
page variant). Everything from commit 3 on (pane, CounterSplit, TablePane, HandoffCard, skeletons,
selection, CSS tier, `floor.pane.*` keys, floor-pane mutants) is 2d.

## 1. DESIGN-LANGUAGE draft (§17)

- A staff sub-page's every exit to the floor — the bar's back control, a closed-table bounce, a
  cleared table — asks for the floor BY NAME (`STAFF_DOOR_TARGET.counter`), never a bare `/staff`,
  which resolves by the door cookie and can land on the doors screen.
- A live board's async read never acts on an unmounted view: the poll effect owns an `alive` ref
  (re-armed at setup, cleared in cleanup) and nothing below the `await` — no setState, no router
  call — runs once it is false.
- A board that reports its connection state withdraws the report when it unmounts; the screen's fold
  (`aggregateConnection`) only ever reflects boards that are on screen.
- A realtime session channel is named per MOUNT (`{topic}:{sessionId}:{seq}`); two consumers of one
  session, or a remount before the async removal settles, never share a joined channel.

## 2. CHANGELOG

- Staff console (Phase 2a · tablet): clearing a table and a table closing under you now return to the
  floor by name (never the doors); a table-page read that lands after you tapped "+ Add items" no
  longer yanks you off the add page; the table page's realtime channel is unique per mount (no
  unhandled rejection / dead realtime after a quick remount, and the order pad can share a session);
  a board that closes no longer leaves a stale "not updating" on the screen's help report. The table
  page's current output is pinned by a new jsdom suite ahead of the Phase 2 page/pane fork.

## 3. OPEN-ITEMS rows

| Sev | Item                                                                             | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low | `FloorDetailLive`'s `alive` guard is per poll-effect, not per read generation    | `apps/qr/components/staff/FloorDetailLive.tsx` refresh: if `sessionId` changes on a LIVE instance (the effect re-runs, `alive` re-arms), a read started for the OLD session can still land. `detail` is seeded from `initial` once, so such an in-place param change would already be a pre-existing gap (whether Next reuses the instance across `[id]` changes was NOT measured); a read-generation counter compared after the await would close both. Not built (outside COMMIT 1's scope). |
| low | `ClearTableButton.confirm` routes after `await clearTable` with no unmount guard | `apps/qr/components/staff/ClearTableButton.tsx`: same shape as the /add yank, far narrower window (the staff member is on the confirm step).                                                                                                                                                                                                                                                                                                                                                   |

## 4. Mutate-set / CLAUDE.md enumeration changes

None. No file this area edits is in `scripts/verify-slice.mjs`'s mutate set
(`FloorDetailLive.tsx`, `ClearTableButton.tsx`, `LiveConnection.tsx`, `useFloorRealtime.ts` — checked
with the `grep -oE '^\s+file: …'` measure), no mutants added, none re-anchored. The spec's floor-pane
mutant (tests[13]) belongs to the pane variant (2d).

## 5. Owner-visible behaviour changes

- Clearing a table (or the table closing while staff are on it) lands on the FLOOR, even on a tablet
  whose door cookie was never written or was refused — before, it could land on the Kitchen/Counter
  doors screen.
- Tapping "+ Add items" while the table page's 5-second read is in the air no longer bounces the
  server back to the floor if that read comes back "closed".
- The table page's live updates survive a quick back-and-forth into the page (no silent loss of
  realtime after a remount); nothing visible changes when it works.
- On a screen with several live boards, a board that goes away no longer leaves the help report
  saying "not updating".

## 6. K15 strings

None — no new staff strings.

## 7. Deviations from spec

- **useFloorRealtime (c)** — per the plan conflict "tablet-split × order-pad", the name is
  `${topic}:${sessionId}:${++seq}`. The hook ALREADY had an optional `topic = "floor"` parameter
  (A4·2, for the whole-board lane), so no new parameter was added: with a `sessionId` the same `topic`
  is now the name's stem. The order pad passes `"pad"` as that 5th argument in 2c.
- **Authorization check for the new name (c)** — verified: `useFloorRealtime` opens NON-private
  `postgres_changes` channels, authorized per-subscriber by each table's SELECT RLS, not by topic. The
  only `realtime.messages` policy in `supabase/migrations/` (`20260618000000_qr_platform_init.sql`
  :252–256) matches `realtime.topic() like 'table:%'` and parses `split_part(…, ':', 2)` — the diner's
  private `table:{id}` channel in `lib/realtime.ts`, untouched. No server code parses `floor:*`.
  `removeChannel` being async (the remount race) was verified in the installed
  `@supabase/realtime-js@2.108.2` `RealtimeClient.removeChannel` (`await channel.unsubscribe()`) and
  `channel()` (returns the existing channel for a repeated topic).
- **useFloorRealtime test file** — spec says `lib/useFloorRealtime.test.ts`; it renders a hook, so it
  is `lib/useFloorRealtime.test.tsx` with the jsdom docblock (a `.test.ts` may not declare jsdom —
  `check-test-env.mjs`). Same place as `lib/useLiveOrders.test.tsx`.
- **LiveConnection (d)** — the spec's literal `useEffect(() => () => ctx?.remove(board), [ctx, board])`
  was built and MEASURED to hang: the context value's identity changes with every report, so a
  cleanup keyed on `ctx` removes-then-re-adds on each state change, the re-added map is a new object,
  and the provider re-renders into the same cycle forever (the LiveConnection suite timed out at 90s).
  Built instead as an unmount-only effect keyed on the provider's STABLE `remove` callback
  (`useCallback([])`): `useEffect(() => () => remove?.(board), [remove, board])`. Same intent (fires on
  unmount or a board-name change only). "Reducer" in the spec = the provider's functional `setReports`
  updater; `remove` is the new arm beside `report`.
- **tests[28]** — only the ClearTableButton half, per scope (MergeTableButton and the provider arm are
  2d). Added a refused-clear-stays-put case beside it.
- **tests[13]** — page variant only. Also asserts page headings are h2 under the bar's one h1.

## 8. LEARNINGS candidates

- A context value built with `useMemo` over state is NOT a stable effect dependency: an effect whose
  CLEANUP writes that same state (`() => ctx.remove(k)`, `[ctx]`) loops forever, because every write
  mints a new value. Key unmount-only cleanups on a stable callback pulled out of the context.
- `useFloorRealtime`'s channel collision has now been hit three ways (two boards on "floor", a remount
  racing the async `removeChannel`, two consumers of one session). The per-mount sequence closes the
  class; any future `browserClient().channel(name)` with a subscribe-then-`.on` shape needs the same.
