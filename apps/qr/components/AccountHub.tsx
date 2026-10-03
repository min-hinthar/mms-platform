"use client";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ACCOUNT_PANELS,
  accountPanelHref,
  isAccountPanel,
  type AccountPanelKey,
} from "@/lib/account-hub";

/**
 * Phase 3a (D4) — the hub's tabs. The three panels are rendered by the SERVER page (every read has
 * already happened); this only decides which one is showing. A tab tap is instant — no server
 * round-trip, no refetch of the five reads.
 *
 * THE URL IS THE TRUTH, and it is written with a `null` state on purpose. Next 16.2.9 patches
 * `history.replaceState` and syncs its canonical URL — the value `useSearchParams()` is built from —
 * only for a state that does not carry its own `__NA` marker (the A7b note in AccountUpgrade). So a
 * tap writes `?tab=` with `null` state, the router sees it, and `current` is READ BACK from the URL:
 * the browser's Back, a reload, a share, and an in-page link to `?tab=you` (the Orders panel's save
 * line, a server re-render with the SAME `initial`) all land on the panel the address bar names. A
 * prop-change re-seed could not do that — it compared the new prop to the old prop, so a navigation
 * that re-rendered with the same `initial` changed nothing (blind pass on #312, critical 1).
 * `picked` is the fallback for a runtime whose `replaceState` is not patched; the URL wins over it.
 *
 * WAI-ARIA tabs, MANUAL activation: Arrow keys and Home/End move focus between tabs; Enter/Space
 * selects. Each tab is a REAL LINK to its panel's URL (`?tab=`), so before hydration — or with
 * scripts off — every panel is still reachable through a server render (Codex round 1 on #312:
 * a `data-href` on a button opened nothing); with scripts on, the click is intercepted and the
 * panel flips in place. The hidden panels stay in the DOM (`hidden`), so the page's document
 * order — the thing `app/account/page.test.tsx` pins — is unchanged by which panel is open.
 */
export function AccountHub({
  initial,
  panels,
}: {
  initial: AccountPanelKey;
  panels: Record<AccountPanelKey, ReactNode>;
}) {
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const [picked, setPicked] = useState<AccountPanelKey | null>(null);
  // `picked` is a FALLBACK for a runtime whose `replaceState` is not patched; the URL is the
  // truth. So it is spent the moment the URL catches up with it, and dropped when a new server
  // render arrives with another `initial` — otherwise a later navigation to the bare `/account`
  // (the Account tab) would re-render this same instance with no `?tab=` and still show the old
  // panel while the address bar said otherwise (Codex round 2 on #312).
  if (picked !== null && fromUrl === picked) setPicked(null);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setPicked(null);
  }
  const current: AccountPanelKey = isAccountPanel(fromUrl) ? fromUrl : (picked ?? initial);
  const id = useId();
  const tabRefs = useRef<Partial<Record<AccountPanelKey, HTMLAnchorElement | null>>>({});

  const select = (key: AccountPanelKey) => {
    setPicked(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      // `null` state — see the docblock: the state Next stamps carries `__NA`, which makes it bail.
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Deliberate: the URL is a convenience (reload / share / Back); `picked` already shows the panel.
    }
  };

  const onKey = (e: KeyboardEvent<HTMLAnchorElement>) => {
    const keys = ACCOUNT_PANELS.map((p) => p.key);
    const here = (e.currentTarget.dataset.tab as AccountPanelKey) ?? current;
    if (e.key === " ") {
      // A link has no Space activation of its own; a tab does.
      e.preventDefault();
      select(here);
      return;
    }
    const at = keys.indexOf(here);
    let next: AccountPanelKey | null = null;
    if (e.key === "ArrowRight") next = keys[(at + 1) % keys.length] ?? null;
    else if (e.key === "ArrowLeft") next = keys[(at - 1 + keys.length) % keys.length] ?? null;
    else if (e.key === "Home") next = keys[0] ?? null;
    else if (e.key === "End") next = keys[keys.length - 1] ?? null;
    if (!next) return;
    e.preventDefault();
    tabRefs.current[next]?.focus(); // focus only — Enter/Space selects (manual activation)
  };

  return (
    <>
      <div role="tablist" aria-label="Account sections" className="account-tabs">
        {ACCOUNT_PANELS.map((p) => (
          <a
            key={p.key}
            role="tab"
            href={accountPanelHref(p.key)}
            id={`${id}-tab-${p.key}`}
            aria-selected={current === p.key}
            aria-controls={`${id}-panel-${p.key}`}
            tabIndex={current === p.key ? 0 : -1}
            className={`account-tab${current === p.key ? " account-tab-on" : ""}`}
            ref={(el) => {
              tabRefs.current[p.key] = el;
            }}
            onClick={(e) => {
              // Modified clicks (new tab, middle click) behave as the link they are.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault(); // never a navigation: the panel flips in place
              select(p.key);
            }}
            onKeyDown={onKey}
            data-tab={p.key}
          >
            {p.label}
          </a>
        ))}
      </div>
      {ACCOUNT_PANELS.map((p) => (
        <section
          key={p.key}
          role="tabpanel"
          id={`${id}-panel-${p.key}`}
          aria-labelledby={`${id}-tab-${p.key}`}
          hidden={current !== p.key}
          tabIndex={-1}
          className="account-panel"
        >
          {panels[p.key]}
        </section>
      ))}
    </>
  );
}
