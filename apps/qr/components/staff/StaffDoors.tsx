"use client";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@mms/ui";
import { setStaffDoor } from "@/lib/staff-door-actions";
import { STAFF_DOOR_TARGET, type StaffDoor } from "@/lib/staff-door";
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
 * door's target is `/staff` itself: `resolveStaffHome` renders the floor there only once the cookie
 * exists, so a navigation that outran the write would land back on these doors.
 *
 * If the write is refused, the door still opens: memory is a convenience, the page behind it is the
 * job, and a person standing at a counter must never be told "couldn't save that" instead of being
 * let through. The refusal is swallowed DELIBERATELY for that reason — the next open shows the
 * doors again, which is the honest fallback.
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
  const [busy, setBusy] = useState<StaffDoor | null>(null);

  const walk = (door: StaffDoor) => async (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab, middle click) behave as links.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (busy) return; // a second tap while the first is in flight would race two writes
    setBusy(door);
    try {
      await setStaffDoor({ door });
    } catch {
      // Deliberate: the door opens regardless (see the docblock). A thrown action is the same
      // outcome as a refused one — nothing remembered, page still reached.
    }
    router.push(STAFF_DOOR_TARGET[door]);
  };

  return (
    <>
      <nav className="staff-doors" aria-label={sx(lang, "floor.a11y.doors")}>
        <Link
          href={STAFF_DOOR_TARGET.kitchen}
          className="staff-door"
          aria-current={current === "kitchen" ? "true" : undefined}
          aria-busy={busy === "kitchen" || undefined}
          onClick={walk("kitchen")}
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
          className="staff-door"
          aria-current={current === "counter" ? "true" : undefined}
          aria-busy={busy === "counter" || undefined}
          onClick={walk("counter")}
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
 * The manager pages as small tiles — Approvals, Feedback, Orders, Menu, Tips, PIN, Team — plus the
 * two surfaces that were reachable only by bookmark (the TV board) or from the manager-only pilot
 * sheet (the word-check sheet). Every tile is a 44px+ link whose visible text IS its name (no echo:
 * a tile is a chip's size). Role gating happens in the server page that builds `more`.
 */
export function MoreGrid({ lang, more }: { lang: StaffLang; more: MoreTile[] }) {
  if (more.length === 0) return null;
  return (
    <section aria-labelledby="staff-more-h">
      <h2 id="staff-more-h" className="staff-more-head">
        <Chrome lang={lang} k="floor.door.more" />
      </h2>
      <ul className="staff-more" role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {more.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="staff-tile">
              <span className="staff-tile-icon" aria-hidden>
                <Icon name={t.icon} size={28} />
              </span>
              <span className="staff-tile-name">
                <Chrome lang={lang} k={t.k} vars={t.vars} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
