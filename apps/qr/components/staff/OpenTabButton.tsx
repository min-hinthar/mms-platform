"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { openTab } from "@/lib/tabs";

/**
 * Open a trust tab on a dine-in table (S3.1). Low-stakes, single-tap (no confirm step): it marks the
 * cart so the floor reads "Tab open" and the table settles once at close instead of each round — it
 * moves no money and unlocks nothing new, so the copy stays honest about what it does. The server
 * (openTab → mms_open_tab) re-derives authority + the dine-in/open guards; this is just the affordance.
 * On success the parent's realtime re-fetch picks up the new tab state; router.refresh nudges it now.
 */
export function OpenTabButton({ cartId }: { cartId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onOpen() {
    setBusy(true);
    setError(null);
    const res = await openTab({ cartId });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        aria-describedby="open-tab-hint"
        style={btn}
      >
        {busy ? "Opening…" : "Open a tab"}
      </button>
      <p id="open-tab-hint" style={hint}>
        The table orders all night and settles once at close, with any tender.
      </p>
      {error && (
        <p role="alert" style={{ ...hint, marginTop: 4, color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const btn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 20px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  cursor: "pointer",
};
const hint: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t3)",
  minHeight: 16,
};
