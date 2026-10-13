import type { SplitContext } from "./split";

/**
 * PD1 (PATH_DESIGN_2026-10-07 moment 1, Codex round 3 on the specs) — "Let Aye know": the rules,
 * pure.
 *
 * A guest whose dish waits on the host's Send may nudge the host once a minute. The nudge is a
 * DURABLE STAMP on the cart (`qr_carts.send_nudge_seat` / `send_nudge_at`), never presence: a
 * presence flag dies when the guest locks their phone, which is exactly the face-down case the
 * nudge exists for. The server action (`nudgeHost`, lib/send-nudge.ts) writes it through
 * `mms_nudge_host`, whose WHERE restates every rule here; these values are what the Bill DRAWS
 * (who is offered the button, when the line shows, what it says), falsified one input at a time.
 */

/** The stamp as the cart view carries it. */
export type SendNudge = { seat: string; at: string };

/**
 * Who is OFFERED "Let {host} know": a guest (only the host sends, so only a guest waits on one)
 * at a table that can NAME its host (`chosenName` — the default "Guest" is never read as a person),
 * with dishes the host has not sent, and nobody's payment holding the cart (staff cannot send
 * under a pay lock either, so both ways forward hide — m1 decision 18). The host's PRESENCE is
 * never a condition (m1 A6): a face-down phone is the common case, and the stamp waits for it.
 *
 * And only while the stamp itself is READABLE (`nudgeReady`, `getCartView`): the blind pass on
 * #335 — a project without the PD1 migration answers the stamp read 42703, and a button offered
 * there fails on every tap. An unreadable stamp hides the offer; it never offers a dead control.
 */
export function nudgeOffered(s: {
  role: "host" | "guest" | null;
  /** `chosenName(host)` — null when the table has no host, or only the default name for one. */
  hostName: string | null;
  kitchenDraftUnits: number;
  frozen: boolean;
  /** The view's stamp read succeeded (`getCartView.nudgeReady`). */
  ready: boolean;
}): boolean {
  return (
    s.ready && s.role === "guest" && s.hostName !== null && s.kitchenDraftUnits > 0 && !s.frozen
  );
}

/**
 * A database timestamp as microseconds since the epoch, or null when it does not parse. Postgres
 * prints `timestamptz` with up to six fractional digits (trailing zeros trimmed); `Date.parse` keeps
 * three, so two stamps in the same millisecond would compare equal and could order wrongly.
 */
function micros(iso: string): number | null {
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2})(?::?(\d{2}))?$/.exec(
      iso.trim(),
    );
  if (!m) return null;
  const zone = m[4] === "Z" ? "Z" : `${m[4]}:${m[5] ?? "00"}`;
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`);
  if (Number.isNaN(ms)) return null;
  return ms * 1000 + Number((m[3] ?? "").padEnd(6, "0").slice(0, 6));
}

/**
 * Is the stamp a LIVE wait? (the last blind pass on #335) Only the fire clears a stamp, so it
 * outlives a dish that was taken off, voided or switched to to-go — and a LATER, unrelated dine-in
 * draft would read it as "Thiri is waiting on this send." with nobody waiting. A stamp is live while
 * at least one DINE-IN DRAFT on the cart was ADDED at or before it — a dish that was waiting when the
 * guest nudged still waits. `mms_nudge_host` applies the same rule (a stale stamp blocks nothing).
 * `getCartView` reports only a live stamp, so every reader — the host's line, the order bar, the
 * guest's own confirmation — reads the one rule. Anything unparseable reads as no wait.
 */
export function nudgeLive(
  stamp: SendNudge | null,
  lines: ReadonlyArray<{ state: string | null; fulfillment: string | null; createdAt: string }>,
): SendNudge | null {
  if (stamp === null) return null;
  const at = micros(stamp.at);
  if (at === null) return null;
  const waiting = lines.some((l) => {
    if (l.state !== "draft" || l.fulfillment !== "dinein") return false;
    const added = micros(l.createdAt);
    return added !== null && added <= at;
  });
  return waiting ? stamp : null;
}

/** The guest's confirmation shows while the stamp standing on the cart is THIS seat's. */
export function nudgeStands(stamp: SendNudge | null, mySeat: string | null): boolean {
  return stamp !== null && mySeat !== null && stamp.seat === mySeat;
}

/**
 * The host's quiet line, from the table's own name for the waiting seat (`session_members`, never
 * the payload). A seat the table cannot name reads "Someone's waiting"; a stamp on a phone that is
 * not the host's (the nudger's own, a tablemate's) draws nothing — the line is the HOST's.
 */
export function waitingLine(
  stamp: SendNudge | null,
  members: SplitContext["members"],
  viewerRole: "host" | "guest" | null,
): { en: string; my: string } | null {
  if (stamp === null || viewerRole !== "host") return null;
  const who = chosenName(members.find((m) => m.seat === stamp.seat)?.name ?? null);
  return who
    ? {
        en: `${who} is waiting on this send.`,
        my: `${who} က ဒီအော်ဒါ ပို့တာကို စောင့်နေပါတယ်`, // K15 draft (m1, quiet)
      }
    : { en: "Someone’s waiting", my: "တစ်ယောက် စောင့်နေပါတယ်" }; // K15 draft (m1, quiet)
}

/**
 * The name a table CHOSE for a seat, or null. `session_members.display_name` defaults to "Guest"
 * (`packages/db/src/schemas.ts`, `sessionMintInput.name`), and that default is the system's
 * placeholder, not a person: "Guest sends the table's order" and "Let Guest know" would read a
 * role word as a name (m1 graft 3). Trimmed; blank is null too.
 */
export const DEFAULT_SEAT_NAME = "Guest";
export function chosenName(name: string | null | undefined): string | null {
  const n = name?.trim() ?? "";
  return n !== "" && n !== DEFAULT_SEAT_NAME ? n : null;
}

/**
 * PD1 (m1 decision 16, graft 3) — is the HOST asked for a name? Once, at the moment it starts to
 * matter: on their own /cart at a dine-in table, once the party has reached two — a tablemate then
 * reads who sends ("Aye sends the table's order…", `hostSendsCopy`) — and only while the host's
 * seat still carries the default "Guest" (`chosenName` → null), which every tablemate reads as the
 * role sentence instead. Never once a name is chosen (the row's own save included: the caller
 * passes the saved name), never for a guest (only the host is named as the one who sends), never
 * at a solo table (nobody else reads it), and never again this visit after "Not now"
 * (`nameAskDismissKey`). The caller draws it where the host's Send is — the moment the name is read.
 */
export function hostNameAsked(s: {
  /** The session mode (`SplitContext.mode`): only a dine-in table has a Send to be named for. */
  mode: string | null;
  role: "host" | "guest" | null;
  /** The table's name for this seat (`session_members.display_name`), or the one this row saved. */
  myName: string | null;
  /** The table's party, the host included: `partySize` over the page's members and the view's lines. */
  memberCount: number;
  /** "Not now" stands for this visit — or its sessionStorage read has not landed yet. */
  dismissed: boolean;
}): boolean {
  return (
    s.mode === "dinein" &&
    s.role === "host" &&
    s.memberCount >= 2 &&
    chosenName(s.myName) === null &&
    !s.dismissed
  );
}

/**
 * PD1 (Codex round 1 on #356) — the party as /cart can see it LIVE, for `hostNameAsked`'s
 * `memberCount`: the seats of the members the page read, plus every seat that owns a line on the
 * applied view. /cart's watch is the cart and its lines (`useCartRealtime`), never the members, and
 * the page reads the members once — so a tablemate who joined after the host opened /cart was
 * invisible to the gate until a reload. Their first dish is a line with their seat, and it reaches
 * this view through the watch it already has: that is when the host's Send becomes the thing they
 * wait on, and when the ask now appears. A tablemate who joined and added nothing is still counted
 * only from the next page read. A seat is one person however many lines it owns, and a line with no
 * seat (a staff-added dish) is nobody.
 */
export function partySize(
  memberSeats: ReadonlyArray<string>,
  lineSeats: ReadonlyArray<string | null | undefined>,
): number {
  const seats = new Set(memberSeats);
  for (const seat of lineSeats) if (seat) seats.add(seat);
  return seats.size;
}

/** The visit-scoped key "Not now" is kept under (sessionStorage): per table session, so the next
 *  table asks again. Not `mms.qr.`-prefixed: it is not a device-session pointer (lib/device-session). */
export function nameAskDismissKey(sessionId: string): string {
  return `mms.nameAsk.notNow.${sessionId}`;
}

/**
 * The ask's words — m1 screen 3's COPY (English), verbatim. English-only until the K15 native
 * check: the spec's Burmese drafts (m1 COPY (Burmese), "Name ask") are listed for that sitting and
 * never invented or shipped here before it.
 */
export const HOST_NAME_ASK = {
  question: "What should your table call you?",
  reason: "Your table sees you as the one who sends.",
  placeholder: "Your name",
  save: "Save",
  notNow: "Not now",
  saved: "Name saved",
  failed: "Couldn’t save your name — please try again.",
} as const;
