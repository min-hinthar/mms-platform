# SPEC-KDS — kitchen display · expo · order-ready board (W0 design source)

The design source the v7.2 prototype never had for the kitchen surfaces. Grounded in the W-track
benchmark pass (Toast KDS · Square KDS · Fresh KDS · Otter; hardware: Elo/MicroTouch). Build W3 to this;
score against the **O-axes** (`RUBRIC.md`). One principle above all (the benchmark's key insight):
**the BUMP EVENT is the single source of truth** — it drives the diner's /track, the order-ready board,
expo state, and (via `fired_at/started_at/bumped_at`) every kitchen metric for free.

## 1 · The ticket (one card component, three channels)

```
┌──────────────────────────────────┐
│ T4 · dine-in        🕐 03:42     │ ← header strip: 32px table# / name+code · channel badge ·
│──────────────────────────────────│    mm:ss elapsed. The STRIP background is the urgency color.
│ 2  Mohinga                       │ ← qty = solid chip, display weight; item ≥28px / heaviest cut (Hanken 800 · Padauk 700); Burmese primary ≥30px (body parity, P1)
│      no cilantro                 │ ← modifiers indented, ≥20px, FULL contrast (allergy-critical)
│ 1  Shan Noodles                  │
│ ▓▓ NO PEANUTS — allergy ▓▓       │ ← notes: red band, highest-contrast element on the card
│──────────────────────────────────│
│           BUMP ✓                 │ ← full-width ≥60px bump zone (whole ticket)
└──────────────────────────────────┘
```

- **Header identity:** dine-in = table number (32px+); pickup/scango = **first name + short order
  code** (privacy + duplicate-name safe). Channel = a small fixed badge (dine-in / to-go / grocery) —
  the SYMBOLIC dimension. Group-cart seats shown as a suffix when present.
- **Urgency = the header-strip color, nothing else** (Otter's rule: one color dimension per screen —
  never recolor the body; body contrast stays stable). Two thresholds per channel (Square's
  simplicity): dine-in green <8m / amber 8–12m / red >12m; pickup/scango age **from `fire_at`**, not
  order time. Optional subtle red pulse, `prefers-reduced-motion`-gated. Thresholds in config
  (the `mms_tab_config` pattern), not constants.
- **Per-line check-off** (tap the line = started/done — Toast's partial-fulfillment check) stays, but
  the primary act is the **ticket-level bump**.
- Line font sizes come from the type-scale tokens (`--fs-*`) or a dedicated KDS tier — no inline
  magic numbers (the W2c lint ban applies here too).

## 2 · The board

- **Full-bleed grid** (drop the 1100px cap + page chrome). Landscape 15.6": **2 rows × 4 columns**,
  fixed slots; long tickets span two slots; overflow **pages** with dots + an unmissable **"+N more"**
  count — that count IS the rush signal. **Never shrink text to fit** (Toast Grid rule).
- **Header strip (always visible):** open count · oldest age · **late count** · today's avg ticket
  time · All-Day rail toggle · sound toggle/volume · page dots.
- **All-Day rail** (Toast KDS All Day, adapted for one screen): a persistent narrow side rail —
  "Mohinga ×4 · Shan ×3 · Tea salad ×2", largest first, grouped item+modifier for wok dishes. Pure
  client-side reduce over the existing snapshot; no new query.
- **HELD cards** (Fresh's hold-&-fire, the ONE coursing concept we keep): a scheduled pickup ordered
  hours early renders dimmed with its slot time, auto-fires at `slot − prep_minutes`, manual
  fire-early allowed. Prevents scheduled orders aging red since noon (O-G).
- **Station tags,** not station screens (1–3 cooks): wok/cold/drinks chips per line + a client-side
  filter persisted per device. Data model station-aware from day one so a second physical screen is
  config, not schema.

## 3 · Attention (O-C)

- **Chime on arrival** — gesture-armed once at shift start ("enable sound" tap baked into the board's
  open flow), loud by default, in-app volume + mute persisted per device. **Distinct tones per
  channel** (Fresh's per-event sounds); the grocery/pickup tone matters — that customer is standing
  at the counter. **Re-chime at 60–90s** if a ticket sits un-started.
- Visual channel backs it up: border flash on the new card + a "N new" pill when tickets land
  offscreen (reuse the FloorBoard pulse-nonce diff). All flashing reduced-motion-gated.

## 4 · Bump · recall · resilience (O-E · O-F)

- **Bump** = the full-width zone; writes `bumped_at` (never deletes the row). During a rush, guard
  fat fingers: 6-second **undo toast** (preferred over two-tap — zero added friction).
- **Recall rail**: the last 5 bumped tickets restorable for 2 minutes (Fresh Recall). A mis-bump is
  never unrecoverable from the board.
- `navigator.wakeLock.request("screen")` + re-acquire on `visibilitychange`. A 401 from the staff
  session is **distinguished from network failure** → hard-redirect to `/staff/lock`/login (never an
  eternal "Reconnecting…"). Night theme is the KDS default (glare + burn-in + aging colors pop).

## 5 · Expo (the counter view)

- Sort by **effective due time**: `(arrived? 0 : 1, pickup_slot ?? created_at)` — a waiting human
  outranks bag age; "Here now" pins to top.
- Bags headline the **first name + short code** captured at pickup/scango checkout (one optional
  field) — expo finally has something to call out.
- Bagging bump → `togo_status='ready'` → the diner's /track AND the order-ready board flip together.

## 6 · Order-ready board (`/board` on any smart TV)

- Two columns — **Preparing | Ready** (Fresh Order Tracker). Cards: first name + short code. Gold
  flash + optional chime on the Preparing→Ready transition; auto-clear 10 min after picked-up.
  Takeout + grocery only (dine-in status stays on the diner's phone). Bilingual EN/MY headings.
- **Auth (decided at W0):** the TV **cannot** join the private RLS-gated realtime channels — it runs
  a **sanitized poll endpoint** (first name + short code + status ONLY) behind a device token in the
  board URL, 5s interval (the house poll-backstop pattern). No `realtime.messages` change.

## 7 · Metrics (free, from the bump)

Store `fired_at / started_at / bumped_at` per line. Board header shows **today's avg ticket time +
current late count** — nothing more. Weekly owner rollup (avg by daypart/channel, % within threshold)
comes later on the staff surface; the same thresholds drive the aging colors so the metric and the UI
can never disagree. Industry anchors: entrées <20 min (<30 rush); fast-casual order→food 8–12 min.

## 8 · Hardware envelope

15.6" Android touchscreen (or iPad + rugged case) on a VESA arm at the pass, angled off the wok line,
wipeable screen protector. The board is a browser page — any smart TV. No bump-bar hardware (touch +
recall covers a 1–3 cook kitchen).
