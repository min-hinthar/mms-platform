# Free Kit Map — best free alternative per feature

The $0-to-start counterpart to every paid pick. Each is MIT/Apache OSS, a copy-paste registry you own the code of, or a generous free tier — all targeting our stack (**Next.js 16 · React 19 · Tailwind v4 · Supabase**). The principle: ship the full feature set at **$0/month software cost**; the only unavoidable spend is Stripe's per-transaction fee (true of any processor).

| Feature (in our app) | Best free pick | License / free-tier | Paid option it replaces |
|---|---|---|---|
| Component system | **shadcn/ui** (+ Radix primitives) | MIT, you own the code | HeroUI Pro (~$249) |
| Headless primitives | **Radix UI** · Base UI · Headless UI | MIT | — |
| Bottom sheet / drawer | **Vaul** (Radix-based, snap points) | MIT | HeroUI Pro sheet |
| Modal + focus management | **Radix Dialog** (traps for you) | MIT | — |
| Animation / motion | **Motion** (`motion/react`) | MIT | Motion+ (~$150) |
| Number-roll totals | **NumberFlow** (`@number-flow/react`) | MIT | — |
| Carousel (upsell row) | **Embla Carousel** | MIT | Aceternity (~$89) |
| Toasts | **Sonner** | MIT | — |
| Celebration / confetti | **canvas-confetti** (lazy-import) | MIT | Magic UI confetti |
| Icons | **lucide-react** | ISC | — |
| Client state | **Zustand** | MIT | — |
| Server state / cache | **TanStack Query** | MIT | — |
| Forms + validation | **React Hook Form** + **Zod** | MIT | — |
| Image optimization | **next/image** (built-in) + your photos | free | Cloudinary (optional) |
| Analytics + flags + replay | **PostHog** free (1M events/mo) | freemium | Amplitude/paid |
| Privacy-first pageviews | **Umami** / **Plausible** (self-host) | MIT/AGPL | Fathom (~$15/mo) |
| Auth + DB + realtime presence | **Supabase** free tier | freemium | — |
| Payments | **Stripe** (+ Terminal in-person) | per-txn, no monthly | — |
| PWA / offline | **Serwist** (`@serwist/next`) | MIT | — |
| Bilingual EN/MY | **next-intl** | MIT | — |

## Key snippets
**NumberFlow total** — `npm i @number-flow/react`
```tsx
import NumberFlow from "@number-flow/react";
<NumberFlow value={total} format={{ style:"currency", currency:"USD" }} />
```

**Realtime group cart + presence (Supabase).** ⚠️ The naive `channel("table-12")` keyed by a client-asserted id is **the exact pattern the red-team flagged** (anyone who scans can join/lock/edit). In the real build, the channel must be a **private** channel authorized by RLS on `realtime.messages`, with the seat key coming from the **signed table-session JWT**, not `crypto.randomUUID()`. See [`RED-TEAM.md`](RED-TEAM.md) standard #4 and [`../BACKEND_ARCHITECTURE.md`](../BACKEND_ARCHITECTURE.md).

## Cost ladder (when "free" starts costing)
At MMS volume (~$406k card / ~5,500 orders a year — *confirm*): PostHog's 1M free events ≈ 180 events/order before you'd pay (~$0.00005/event after); Supabase Pro ($25/mo) only when you exceed 500 MB DB / 5 GB bandwidth — note Supabase **branching needs Pro**, so a staging project covers migration testing meanwhile; `next/image` covers images until you outgrow it. Net: the entire UI / analytics / realtime stack ships for **$0/month**; you pay Stripe's per-charge fee and nothing else.

## Recommendation
Build on **shadcn/ui + Radix + Motion + Vaul + NumberFlow + Embla + Sonner + canvas-confetti + lucide**, state with **Zustand + TanStack Query**, realtime group-cart on **Supabase** (private channels), **PostHog** free for funnel/flags/replay. Full feature set, zero monthly software cost. Self-host Umami/Plausible only if you want analytics entirely on your own infra.
