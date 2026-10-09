"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Icon } from "@mms/ui";
import {
  circleFromBoard,
  circleSeed,
  type ApprovalsCircle,
  type BoardReading,
  type PendingCount,
} from "@/lib/approvals-count";
import { localizeCount } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";

/**
 * PD8 (m8 decisions 3 · 4) — the bar's approvals circle reads the board's OWN 5 s snapshot through
 * this context: one poll, never two. What it may claim is a value:
 *   · `count` — the live number, or null when nobody could read one (NEVER a false 0);
 *   · `frozen` — the queue stopped updating: the ring turns DASHED (a shape, not colour alone) and
 *     the sr-only name gains the board's as-of sentence;
 *   · `unknown` — the count could not be read at all: a dashed ring with no number, and the name
 *     "Approvals — couldn't check".
 * The server render seeds it (`countPendingApprovals`'s verdict); on a page with no board (the
 * doors) that seed is all the circle ever shows, and a board whose queue was never read on this page
 * leaves it standing (`circleFromBoard`).
 */
export type ApprovalsCountState = ApprovalsCircle;

const Ctx = createContext<{
  state: ApprovalsCountState;
  publish: (s: BoardReading) => void;
} | null>(null);

export function ApprovalsCountProvider({
  initial,
  children,
}: {
  initial: PendingCount;
  children: ReactNode;
}) {
  const [state, setState] = useState<ApprovalsCountState>(() => circleSeed(initial));
  // The board's reading folds into the seed (`circleFromBoard`): a queue this page never read claims
  // no number, so the server's count — or its "couldn't check" — stands (the blind pass on #333).
  const publish = useCallback((b: BoardReading) => {
    setState((prev) => {
      const s = circleFromBoard(prev, b);
      return prev.count === s.count &&
        prev.frozen === s.frozen &&
        prev.unknown === s.unknown &&
        prev.frozenCopy === s.frozenCopy
        ? prev
        : s;
    });
  }, []);
  return <Ctx.Provider value={{ state, publish }}>{children}</Ctx.Provider>;
}

/** The board publishes its reading after every poll; a no-op where no provider is mounted. */
export function useApprovalsCountPublish(b: BoardReading): void {
  const ctx = useContext(Ctx);
  const publish = ctx?.publish;
  useEffect(() => {
    publish?.(b);
  }, [publish, b.read, b.count, b.frozen, b.frozenCopy]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The circle itself — the bar's trailing slot. */
export function ApprovalsCircle({ lang, href }: { lang: StaffLang; href: string }) {
  const ctx = useContext(Ctx);
  const state: ApprovalsCountState = ctx?.state ?? {
    count: null,
    frozen: true,
    unknown: true,
    frozenCopy: null,
  };
  const { count, frozen, unknown, frozenCopy } = state;
  const dashed = frozen || unknown;
  return (
    <a
      href={href}
      className="staff-circ staff-press staff-circ-count-host"
      data-frozen={dashed ? "true" : undefined}
      data-approvals-count={count ?? "unknown"}
    >
      <Icon name="check" size={20} />
      {count !== null && count > 0 && (
        <span className="staff-circ-count" aria-hidden>
          {localizeCount(count, lang)}
        </span>
      )}
      <span className="sr-only">
        {unknown ? (
          <Chrome lang={lang} k="floor.nav.approvalsUnknown" />
        ) : count !== null && count > 0 ? (
          <Chrome lang={lang} k="floor.nav.approvalsCount" vars={{ n: count }} />
        ) : (
          <Chrome lang={lang} k="floor.nav.approvals" />
        )}
        {frozen && frozenCopy && <> — {frozenCopy}</>}
      </span>
    </a>
  );
}
