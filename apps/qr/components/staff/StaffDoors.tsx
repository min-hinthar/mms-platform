"use client";
import { useRouter } from "next/navigation";
import { type MouseEvent, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@mms/ui";
import { setStaffDoor } from "@/lib/staff-door-actions";
import { STAFF_DOOR_TARGET, type StaffDoor, parseStaffDoor } from "@/lib/staff-door";
import { haptic } from "@/lib/haptics";
import type { StaffLang } from "@/lib/staff-lang";
import type { StaffKey } from "@/lib/i18n/staff";
import { sx } from "@/lib/staff-labels";
import { Chrome } from "./Chrome";

/**
 * P7 — the two DOORS `/staff` opens on, and the More grid beneath them.
 *
 * A door is a real link (its href is the page it opens), so it works with JavaScript off and reads
 * as a link to assistive tech. With JavaScript on, the click first REMEMBERS the door on this device
 * (`setStaffDoor`, a cookie) and then navigates — awaited, not fire-and-forget, because the counter
 * door's target is `/staff` itself: a navigation that outran the write would render `/staff` with no
 * cookie yet. The counter href therefore asks for the floor BY NAME (`/staff?floor=1`, which
 * `resolveStaffHome` honours whatever the cookie says), so the door opens the floor with JavaScript
 * off and on a device whose cookie could not be written — the blind pass found the first draft's
 * bare `/staff` landing a refused Counter tap back on these doors.
 *
 * If the write is refused, the door still opens: memory is a convenience, the page behind it is the
 * job, and a person standing at a counter must never be told "couldn't save that" instead of being
 * let through. The refusal is swallowed DELIBERATELY for that reason — the next open shows the
 * doors again, which is the honest fallback. The in-flight flag is released BEFORE the navigation
 * is asked for, because a navigation can land on this very route with the doors still mounted, and
 * a flag latched on the way out left two dead links until a reload (blind pass CRITICAL 2).
 *
 * The door this tablet walked through wears the lit-gold cap (`aria-current="true"`) and says so in
 * words: a gold border alone is a status nobody can name.
 */
export type MoreTile = {
  href: string;
  k: StaffKey;
  icon: IconName;
  /** The one slot a tile label may carry (`floor.nav.approvalsCount`'s `{n}`). */
  vars?: Record<string, string | number>;
};

export function StaffDoors({
  lang,
  current,
  more,
}: {
  lang: StaffLang;
  current: StaffDoor | null;
  more: MoreTile[];
}) {
  const router = useRouter();
  // The in-flight guard is a REF, written synchronously: two taps in one frame both read the same
  // stale render, so a state flag lets both through (two writes, two pushes). The state beside it
  // exists only to say `aria-busy` on the door that is opening.
  const inFlight = useRef<StaffDoor | null>(null);
  const [busy, setBusy] = useState<StaffDoor | null>(null);

  // ONE handler for both doors, the door read from the link's `data-door` — not a curried
  // `walk(door)` factory, which runs during render and so puts the ref read under the compiler's
  // "no refs during render" rule even though only the returned closure ever touches it.
  const walk = async (e: MouseEvent<HTMLAnchorElement>) => {
    const door = parseStaffDoor(e.currentTarget.dataset.door);
    if (!door) return; // not a door — an ordinary link, left alone
    // Let modified clicks (new tab, middle click) behave as links.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (inFlight.current) return; // one navigation is already coming; a second tap adds nothing
    inFlight.current = door;
    setBusy(door);
    // A door is a COMMIT (W22c vocabulary): the tablet is being told what it is. The visible half is
    // the press itself (`.staff-press` scale + sheen) and the page that opens — never the buzz alone.
    haptic("commit");
    try {
      await setStaffDoor({ door });
    } catch {
      // Deliberate: the door opens regardless (see the docblock). A thrown action is the same
      // outcome as a refused one — nothing remembered, page still reached.
    } finally {
      // Released here, not after the push: the push may leave these doors mounted (see docblock).
      inFlight.current = null;
      setBusy(null);
    }
    router.push(STAFF_DOOR_TARGET[door]);
  };

  return (
    <>
      <nav className="staff-doors" aria-label={sx(lang, "floor.a11y.doors")}>
        <Link
          href={STAFF_DOOR_TARGET.kitchen}
          className="staff-door card-textured staff-press mms-stagger"
          aria-current={current === "kitchen" ? "true" : undefined}
          aria-busy={busy === "kitchen" || undefined}
          data-door="kitchen"
          onClick={walk}
        >
          <span className="staff-door-icon" aria-hidden>
            <Icon name="flame" size={44} />
          </span>
          <span className="staff-door-name">
            {/* The kitchen has ONE word on every staff surface — the wall, the pass, this door. */}
            <Chrome lang={lang} k="kds.title" echo="stack" />
            <span className="staff-door-sub">
              <Chrome lang={lang} k="floor.door.kitchen.sub" echo="stack" />
            </span>
            {current === "kitchen" && (
              <span className="staff-door-here">
                <Chrome lang={lang} k="floor.door.here" echo="inline" />
              </span>
            )}
          </span>
        </Link>
        <Link
          href={STAFF_DOOR_TARGET.counter}
          className="staff-door card-textured staff-press mms-stagger"
          aria-current={current === "counter" ? "true" : undefined}
          aria-busy={busy === "counter" || undefined}
          data-door="counter"
          onClick={walk}
        >
          <span className="staff-door-icon" aria-hidden>
            <Icon name="cash" size={44} />
          </span>
          <span className="staff-door-name">
            <Chrome lang={lang} k="floor.door.counter" echo="stack" />
            <span className="staff-door-sub">
              <Chrome lang={lang} k="floor.door.counter.sub" echo="stack" />
            </span>
            {current === "counter" && (
              <span className="staff-door-here">
                <Chrome lang={lang} k="floor.door.here" echo="inline" />
              </span>
            )}
          </span>
        </Link>
      </nav>
      <MoreGrid lang={lang} more={more} />
    </>
  );
}

/**
 * The manager pages beneath the doors — Approvals, Feedback, Orders, Menu, Tips, PIN, Team — plus
 * the two surfaces that were reachable only by bookmark (the TV board) or from the manager-only
 * pilot sheet (the word-check sheet). P7·1b: INSET GROUPED ROWS (the iOS Settings idiom, Burmese
 * first) rather than a tile wall — a 62px row with a tinted glyph square, the name with its English
 * echo beneath, and a disclosure chevron; two columns on a tablet, one on a phone, hairlines drawn
 * once. Still one `role="list"` of real links, named by the visible "More" heading. Role gating
 * happens in the server page that builds `more`.
 */
export function MoreGrid({ lang, more }: { lang: StaffLang; more: MoreTile[] }) {
  if (more.length === 0) return null;
  return (
    <section aria-labelledby="staff-more-h">
      <h2 id="staff-more-h" className="staff-more-head">
        <Chrome lang={lang} k="floor.door.more" />
      </h2>
      <ul className="staff-inset" role="list">
        {more.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="staff-row staff-press">
              <span className="staff-row-glyph" aria-hidden>
                <Icon name={t.icon} size={22} />
              </span>
              <span className="staff-row-name">
                <Chrome lang={lang} k={t.k} vars={t.vars} echo="stack" />
              </span>
              <span className="staff-row-chev" aria-hidden>
                <Icon name="chevron" size={18} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
