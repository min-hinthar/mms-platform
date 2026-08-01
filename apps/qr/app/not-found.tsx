import Link from "next/link";

/**
 * W10a — the branded 404 (the app previously fell to Next's unbranded system-font default: the only
 * voice-less screen in the app, and it sat on the worst journey moment — a mangled /track link
 * right after payment). DB-less by construction: this must render during a full outage. Static
 * links only — no wayfinding reads (the not-found boundary is a Server Component; anything live
 * here would turn a 404 into a second failure).
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <p aria-hidden style={{ fontSize: "var(--fs-display)", margin: 0 }}>
          🫖
        </p>
        <h1
          style={{ fontSize: "var(--fs-h2)", lineHeight: "var(--lh-snug)", margin: "10px 0 2px" }}
        >
          That page isn’t on our menu
        </h1>
        <p
          lang="my"
          style={{
            fontFamily: "var(--font-my)",
            lineHeight: "var(--lh-my)",
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            margin: "0 0 6px",
          }}
        >
          ဤစာမျက်နှာကို ရှာမတွေ့ပါ
        </p>
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--t2)",
            lineHeight: "var(--lh-normal)",
            margin: "0 0 18px",
          }}
        >
          The link may be old or mistyped. If you just paid, your order is safe — check Rewards
          &amp; account, or our staff can look it up anytime.
        </p>
        <p
          style={{
            margin: 0,
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 48,
              padding: "0 22px",
              borderRadius: 999,
              background: "var(--ac)",
              color: "var(--oa)",
              fontWeight: 800,
              fontSize: "var(--fs-h3)",
              textDecoration: "none",
            }}
          >
            Back to the start
          </Link>
          <Link
            href="/account"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 48,
              padding: "0 18px",
              borderRadius: 999,
              border: "1px solid var(--bd)",
              color: "var(--tx)",
              fontWeight: 700,
              fontSize: "var(--fs-sm)",
              textDecoration: "none",
            }}
          >
            My orders
          </Link>
        </p>
      </div>
    </main>
  );
}
