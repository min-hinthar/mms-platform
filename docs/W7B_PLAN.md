# W7B_PLAN — The resilience shell (W7's second PR · closes S3)

**Status: SHIPPED (2026-08-13).** Closed **S3** (registry: an S3a note — sweep aged
`mms_scan_events` rows server-side). Serwist service worker + update flow, device-offline banner, and
the offline grocery **scan queue** — the production-readiness layer ("table wifi makes it
foundation"). Design parents: `docs/PRODUCTION_PLAN.md` §W7 (Resilience PR) + the **delivery
repo's production-hardened SW pattern** (the port source — its guards each encode a shipped
outage: opaque-response cache poisoning, surprise first-install reloads, stale-tab deploys).

Grounded by a five-reader map (delivery SW · qr shell · connection truth · scan path · cache
surface). The findings that reshape the plan:

- **The chunk-reload boundary ALREADY EXISTS** (`lib/error-recovery.ts`, W10b): one-shot
  cooldown-guarded reload with an offline veto, shared by both error boundaries. W7b's job is to
  not break it — an SW that caches documents/chunks would turn that reload into a no-op loop.
- **No HTML is precacheable.** The root layout is `force-dynamic` for the per-request CSP nonce —
  every document render is per-request. So: **documents are network-only**, the offline fallback
  is a **synthetic response built inside the SW** (embedded HTML template — no cached nonce, no
  CSP header on a SW-constructed response, versioned with the SW itself), and the precache covers
  only `public/` assets; `/_next/static` (content-hashed immutable) + `/_next/image` are runtime
  caches with caps.
- **A replayed scan DOUBLE-ADDS today, by design.** `scanAdd` takes `{cartId, barcode}` only; a
  repeat is qty+1 (`insertOrIncLine` → `mms_cart_item_inc_qty`), deliberately — live re-scans must
  count. So the queue's idempotency needs a **server-persisted per-scan-event id**, deduped **in
  the SQL statement** (the repo doctrine): the delivery repo's terminal-state-compare trick cannot
  work for a counter.
- **The truth layer is done** (W10a `useConnectionTruth`: `you-offline` / `we-down` / `unknown`,
  captive-portal-safe). The banner composes with it — it must never re-derive truth, and
  `we-down` must NOT queue-and-promise (scan verdicts only the server can give).

## W7b·1 — the service worker + update flow + banner

**Build**: `apps/qr/sw/sw.ts` compiled by `apps/qr/scripts/build-sw.mjs` (the delivery esbuild
pattern — no Next plugin; Serwist/Turbopack incompat) chained as `"build": "next build && node
scripts/build-sw.mjs"`. **Turbo cache blindness is the trap**: `public/sw.js*` joins the build
task's `outputs` in `turbo.json`, or a warm cache ships without the SW. `.gitignore` + prettier
ignore the artifact; the SW source carries webworker types.

**Caching policy (stricter than delivery — the honesty constraints):**

| Surface | Strategy |
| --- | --- |
| Documents (all routes) | **NetworkOnly**; catch → the synthetic offline shell (bilingual, tokens inlined, Try-again = reload) |
| `/api/*`, `/ingest/*`, every POST / Server Action | **Never intercepted** — money, session, analytics, and `/api/health` (a cached `{db:'ok'}` would re-blame the diner during a real outage — the exact lie W10a killed) |
| `/_next/static/*` | CacheFirst (content-hashed immutable), capped + expiring |
| `/_next/image?*` | StaleWhileRevalidate, `statuses:[200]` only (the delivery cache-poisoning lesson: never cache opaque/error), maxEntries + `purgeOnQuotaError` |
| `public/` assets | Precache (getManifest over public/, cache-bust-exempt hashed names) |

`CACHE_VERSION` suffix on every runtime cache + the manual activate-time sweep of stale versions
(Serwist only cleans the precache). `skipWaiting: false` + `clientsClaim: true` + the
`SKIP_WAITING` message listener.

**Registration + update (the delivery flow, slimmed):** a root-layout client component (prod-only,
scope `/`) with the hardened pieces ported verbatim — `registration.update()` on a **10-min
heartbeat + visibility/online wake** (browsers only re-fetch `sw.js` on hard navigations; the
installed-PWA/staff-tablet population never hard-navigates), the **first-install
`controllerchange` guard** (`clientsClaim` fires it for brand-new visitors — a reload there races
chunk loads), and on a waiting worker a quiet **"A new version is ready — Refresh"** strip
(`SKIP_WAITING` postMessage → guarded reload → 4s failsafe). No countdown/auto-reload in v1.

**The banner:** device-offline only, `useConnectionTruth` as the single source (never a second
bare `navigator.onLine` listener), `role="note"` (a persistent strip must not add a second live
region to views that already own one — the QA §A rule), the reserved `WifiOff` glyph, hidden on
`/staff` + `/kiosk` + `/board` (staff has its own frozen-ledger vocabulary; the kiosk clears to
attract). Per-surface reactive offline copy stays — the strip is ambient truth, the surfaces stay
the announcers.

## W7b·2 — the offline scan queue + barcode map

**The server half (migration `…_w7b_scan_events.sql`):** `mms_scan_events (cart_id fk, scan_id
uuid primary key, created_at)` — RLS default-deny, reachable only through the DEFINER fns.
`mms_cart_item_inc_qty` + `mms_cart_item_insert_if_open` re-sign with `p_scan_id uuid default
null` (drop-both dance ×2, grants re-issued): when non-null, the fn's **first statement** inserts
the event `on conflict do nothing`; a duplicate returns without writing — **atomic in the fn's own
transaction**, so a burned-claim-then-failed-write can't happen and the dedupe survives the
TS-side inc-vs-insert branch flip between attempts (the ledger is per cart+scan, not per branch).
`scanAdd` gains optional `scanId` (Zod uuid) threaded through `insertOrIncLine`; a duplicate is an
**idempotent OK carrying the current lines** (the delivery lesson: never an error the queue marks
permanent). Live scans (no scanId) are byte-identical to today.

**The client half (`lib/grocery-queue.ts` + page wiring):** entries are **`{scanId, cartId,
barcode, queuedAt}` and nothing else** — never a price, name, or qty (pricing stays
server-authoritative; the server re-derives at replay time and the server price wins). Enqueue
only on `you-offline` (or a transport throw with `navigator.onLine === false`); `we-down` keeps
today's honest refusal. Drain on the `online` event + a timer while non-empty: **serialized FIFO
with spacing** (never `Promise.all` — the 120/60s mutation rate treats a burst as flood, and its
throw is prod-redacted into a generic transport error), classified by the existing union — `ok` →
dequeue (an `ok` with `lines:null` is DELIVERED — the write committed); catalog refusals
(`unknown_barcode`/`unavailable`/`weighed_item`) → dequeue + surface; **`isTerminal` → flush the
whole cart's queue** (never replay into a re-minted fresh basket — cross-cart replay charges the
new basket for the dead one's scans); transport/locked/settling → keep with backoff. Replays ride
the page's existing `add()` funnel (seq tickets + `cartIdRef` checks) — the W9d discipline.
localStorage persistence in the repo's try/catch-stash idiom, Zod-validated at enqueue AND drain,
~2h TTL, capped; storage-unavailable degrades to today's copy. The **"Start a fresh basket"**
recovery flushes the old cart's queue.

**Queued-scan UI:** a visibly distinct "waiting to sync · N" state (pending badge + per-item
"will confirm when back online" rows) — queued scans are **never merged into lines or the running
total** (the cart renders the SERVER's view; the server may refuse them at replay).

**The barcode map:** persist `getGroceryCatalog()`'s result (already fetched by GroceryBrowse;
barcode + names + priceCents, ~400 rows) to localStorage with `fetchedAt`; offline scans get
instant local feedback ("≈$3.99 — confirms when back online") **labeled as an estimate** (the menu
last-good staleness-strip precedent). The map is display-only by construction — the charge is
always the server's replay-time derivation. Kiosk: **no persistent queue** (memory-only privacy
model; a persisted scan would outlive `kioskReset`) — the kiosk keeps its live-scan behavior.

## Hardening (new rules → guards, each watched fail)

- `order-lines/scan-id-not-threaded` — the RPC payload must carry `p_scan_id` (TS suite asserting
  the call shape).
- `grocery/duplicate-scan-id-still-adds` — the SQL dedupe, pinned by a `supabase/tests` assert in
  the tax-parity harness (CI's real stack runs it).
- `grocery-queue/*` — drain is FIFO-serialized · a terminal verdict flushes the cart's queue · the
  persisted entry never carries a price (owning suite `lib/grocery-queue.test.ts`, pure).
- SW policy pinned by a pure config test where expressible (the never-intercept list).

## Deliberately out (registry rows)

- Background Sync API (the queue drains on app-open/online — SW-independent by design, so it
  works before the SW installs and under private-mode storage).
- Update countdown/auto-activate UX (v1 = quiet strip; revisit with real staff-tablet feedback).
- Precache of page shells (impossible under the nonce CSP — revisit only if the CSP model changes).
- Spanish/third-language offline shell copy (EN/MY per the bilingual bar).

## Slices

- **W7b·1** — build-sw + SW + registration/update strip + offline banner + turbo/CI wiring +
  offline shell.
- **W7b·2** — scan_events migration + RPC re-signs + scanAdd scanId + queue + pending UI +
  barcode map.
- **W7b·3** — guards + mutants · docs sweep (S3 close) · gate · ONE capped review · PR.
