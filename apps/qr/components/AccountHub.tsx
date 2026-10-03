"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ACCOUNT_PANELS, accountPanelHref, type AccountPanelKey } from "@/lib/account-hub";

/**
 * Phase 3a (D4) — the hub's tabs. The three panels are rendered by the SERVER page (every read has
 * already happened); this only decides which one is showing. A tab tap is instant — no server
 * round-trip, no refetch of the five reads — and writes `?tab=` with `history.replaceState` so a
 * reload, a share and the browser's Back land where the diner was.
 *
 * WAI-ARIA tabs, manual activation: Arrow keys move focus between tabs, Enter/Space (the click)
 * selects; Home/End jump. The hidden panels stay in the DOM (`hidden`), so the page's document
 * order — the thing `app/account/page.test.tsx` pins — is unchanged by which panel is open.
 */
export function AccountHub({
  initial,
  panels,
}: {
  initial: AccountPanelKey;
  panels: Record<AccountPanelKey, ReactNode>;
}) {
  const [current, setCurrent] = useState<AccountPanelKey>(initial);
  const id = useId();
  const tabRefs = useRef<Partial<Record<AccountPanelKey, HTMLButtonElement | null>>>({});
  // A new server render (a sign-in that re-rendered the page onto ?tab=you) re-seeds the panel.
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setCurrent(initial);
  }

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") === current) return;
      url.searchParams.set("tab", current);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // Deliberate: the URL is a convenience (reload / share); the panel is already showing.
    }
  }, [current]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ACCOUNT_PANELS.map((p) => p.key);
    const at = keys.indexOf(current);
    let next: AccountPanelKey | null = null;
    if (e.key === "ArrowRight") next = keys[(at + 1) % keys.length] ?? null;
    else if (e.key === "ArrowLeft") next = keys[(at - 1 + keys.length) % keys.length] ?? null;
    else if (e.key === "Home") next = keys[0] ?? null;
    else if (e.key === "End") next = keys[keys.length - 1] ?? null;
    if (!next) return;
    e.preventDefault();
    setCurrent(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Account sections" className="account-tabs">
        {ACCOUNT_PANELS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            id={`${id}-tab-${p.key}`}
            aria-selected={current === p.key}
            aria-controls={`${id}-panel-${p.key}`}
            tabIndex={current === p.key ? 0 : -1}
            className={`account-tab${current === p.key ? " account-tab-on" : ""}`}
            ref={(el) => {
              tabRefs.current[p.key] = el;
            }}
            onClick={() => setCurrent(p.key)}
            onKeyDown={onKey}
            // A real destination too, for the rare non-JS read of the page (the tab is a button
            // because a link would spend a navigation; the href is the same panel by URL).
            data-href={accountPanelHref(p.key)}
          >
            {p.label}
          </button>
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
