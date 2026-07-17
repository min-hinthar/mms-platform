"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getFeedbackState, submitFeedback } from "@/lib/feedback";
import { Card, Icon } from "@mms/ui";

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
        {/* Focused on submit (via DoneHeading): the form (with the pressed Send button) unmounts in
            favour of this card — moving focus to the heading keeps the SR/keyboard user's place AND
            reads the thank-you as the success cue (one move, no extra live region — WCAG 2.4.3). */}
        <DoneHeading justSubmitted={submittedRating > 0}>
          {low ? "Thank you — we’ll make it right" : "Thanks for your feedback!"}
        </DoneHeading>
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
      {/* Plain toggle buttons (aria-pressed), NOT role=radio: fake radios promise arrow-key roving
          they don't implement (all five were tabbable with no keyboard model). The LossActionSheet
          convention — honest semantics over aspirational roles. */}
      <div role="group" aria-label="Rating, 1 to 5 stars" style={stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            style={{ ...starBtn, color: n <= rating ? "var(--ac)" : "var(--t3)" }}
          >
            <Icon name="star" size={28} fill={n <= rating ? "currentColor" : "none"} />
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
      <p role="status" aria-atomic="true" style={errLine}>
        {error}
      </p>
    </Card>
  );
}

// The thank-you heading; takes focus on mount only right after THIS device's submit (not when the
// card renders for an already-reviewed order on a revisit).
function DoneHeading({ justSubmitted, children }: { justSubmitted: boolean; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (justSubmitted) ref.current?.focus({ preventScroll: true });
    // mount-only: the submit → done swap is the one seam this covers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <h2 id="fb-h" ref={ref} tabIndex={-1} style={{ ...h2, outline: "none" }}>
      {children}
    </h2>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  marginTop: "var(--s5)",
  padding: "var(--s5)",
};
const h2: CSSProperties = {
  margin: "0 0 4px",
  fontSize: "var(--fs-h3)",
  fontWeight: 800,
  color: "var(--tx)",
};
const sub: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
  lineHeight: 1.5,
};
const stars: CSSProperties = { display: "flex", gap: 4, margin: "4px 0 12px" };
const starBtn: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: "none",
  background: "transparent",
  // the star is an <Icon size={28}> SVG (W2b) — no fontSize needed (it sized the old ★ emoji)
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
  fontSize: "var(--fs-body)", // ≥16px → no iOS zoom-on-focus
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
  fontSize: "var(--fs-body)",
  cursor: "pointer",
};
const linkBtn: CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  minHeight: 44,
  lineHeight: "44px",
  color: "var(--ac)",
  fontWeight: 700,
  fontSize: "var(--fs-sm)",
  textDecoration: "none",
};
const errLine: CSSProperties = {
  minHeight: 16,
  margin: "8px 0 0",
  fontSize: "var(--fs-sm)",
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
