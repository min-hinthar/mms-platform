"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { getFeedbackState, submitFeedback } from "@/lib/feedback";
import { Card } from "@mms/ui";

/**
 * Post-order feedback (M4 P4.3) — at peak goodwill on /track. UNGATED (docs/M4_DESIGN R9): ask for an
 * honest rating + optional note, and after ANY rating offer the public-review link to EVERYONE — never gate
 * it by score. A low rating adds a recovery line (staff are pinged server-side) but the link still shows.
 * Renders nothing unless the caller is the order's earner and hasn't reviewed yet.
 */
export function FeedbackPrompt({ orderId }: { orderId: string }) {
  const [canReview, setCanReview] = useState(false);
  const [done, setDone] = useState(false); // already reviewed, or just submitted
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [submittedRating, setSubmittedRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getFeedbackState(orderId)
      .then((s) => {
        setCanReview(s.canReview);
        setDone(s.reviewed);
        setGoogleUrl(s.googleReviewUrl);
      })
      .catch(() => {
        /* a state-fetch failure just hides the prompt — never blocks the tracker */
      });
  }, [orderId]);

  async function submit() {
    if (rating < 1) return;
    setBusy(true);
    setError(null);
    const res = await submitFeedback(orderId, rating, comment.trim() || undefined);
    setBusy(false);
    if (!res.ok) {
      // "exists" → already reviewed (treat as done); anything else → honest retry copy.
      if (res.reason === "exists") {
        setSubmittedRating(rating);
        setDone(true);
        return;
      }
      setError("Couldn’t save your feedback — please try again.");
      return;
    }
    setSubmittedRating(rating);
    setDone(true);
  }

  if (!canReview && !done) return null;

  // Post-submit / already-reviewed — thank-you + the public-review link offered to EVERYONE (ungated).
  if (done) {
    const low = submittedRating > 0 && submittedRating <= 3;
    return (
      <Card as="section" style={card} aria-labelledby="fb-h">
        <h2 id="fb-h" style={h2}>
          {low ? "Thank you — we’ll make it right" : "Thanks for your feedback!"}
        </h2>
        <p style={sub}>
          {low
            ? "Sorry it wasn’t perfect. A manager will see this and follow up."
            : "We’re so glad you joined us at Mandalay Morning Star."}
        </p>
        {googleUrl && (
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>
            Share your visit on Google <span aria-hidden>→</span>
          </a>
        )}
      </Card>
    );
  }

  return (
    <Card as="section" style={card} aria-labelledby="fb-h">
      <h2 id="fb-h" style={h2}>
        How was your visit?
      </h2>
      <div role="radiogroup" aria-label="Rating, 1 to 5 stars" style={stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            style={{ ...starBtn, color: n <= rating ? "var(--ac)" : "var(--t3)" }}
          >
            <span aria-hidden>{n <= rating ? "★" : "☆"}</span>
          </button>
        ))}
      </div>
      <label htmlFor="fb-comment" style={srOnly}>
        Anything you’d like to add? (optional)
      </label>
      <textarea
        id="fb-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything you’d like to add? (optional)"
        maxLength={1000}
        rows={3}
        style={textarea}
      />
      <button type="button" onClick={submit} disabled={busy || rating < 1} style={submitBtn}>
        {busy ? "Sending…" : "Send feedback"}
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" style={errLine}>
        {error}
      </p>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  marginTop: "var(--s5)",
  padding: "var(--s5)",
};
const h2: CSSProperties = { margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "var(--tx)" };
const sub: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13.5,
  color: "var(--t2)",
  lineHeight: 1.5,
};
const stars: CSSProperties = { display: "flex", gap: 4, margin: "4px 0 12px" };
const starBtn: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: "none",
  background: "transparent",
  fontSize: 30,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};
const textarea: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--sf)",
  color: "var(--tx)",
  fontSize: 16, // ≥16px → no iOS zoom-on-focus
  resize: "vertical",
  fontFamily: "inherit",
};
const submitBtn: CSSProperties = {
  width: "100%",
  minHeight: 48,
  marginTop: 10,
  borderRadius: 12,
  border: "none",
  background: "var(--ac)",
  color: "var(--oa)",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  minHeight: 44,
  lineHeight: "44px",
  color: "var(--ac)",
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
};
const errLine: CSSProperties = {
  minHeight: 16,
  margin: "8px 0 0",
  fontSize: 12.5,
  color: "var(--warn)",
};
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
