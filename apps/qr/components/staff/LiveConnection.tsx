"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ReportConnection } from "@/lib/staff-report";
import { aggregateConnection, type LiveBoardState } from "@/lib/live-connection";

/**
 * A4·2 — the counter screen's live boards report whether they are updating; the help door in the
 * screen's bar reads the fold (`aggregateConnection`) so a "Something's wrong" report filed from a
 * frozen lane still says `not_updating`. Before the fold, the takeaway board passed the fact to its
 * OWN door; on the one screen the door is the page's, server-rendered, and cannot know (the blind
 * pass on A4·2). A screen with no provider reads `undefined` and the door falls back to `page`.
 */
type Ctx = {
  connection: ReportConnection;
  report: (board: string, state: LiveBoardState) => void;
};
const LiveConnectionContext = createContext<Ctx | null>(null);

export function LiveConnectionProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<Record<string, LiveBoardState>>({});
  const report = useCallback((board: string, state: LiveBoardState) => {
    setReports((r) => (r[board] === state ? r : { ...r, [board]: state }));
  }, []);
  const connection = aggregateConnection(reports);
  const value = useMemo(() => ({ connection, report }), [connection, report]);
  return <LiveConnectionContext.Provider value={value}>{children}</LiveConnectionContext.Provider>;
}

/** The fold, for the door — `undefined` outside a provider (a page with no live board). */
export function useLiveConnection(): ReportConnection | undefined {
  return useContext(LiveConnectionContext)?.connection;
}

/** A board reports its state on every change; a no-op outside a provider. */
export function useReportLive(board: string, state: LiveBoardState): void {
  const ctx = useContext(LiveConnectionContext);
  useEffect(() => {
    ctx?.report(board, state);
  }, [ctx, board, state]);
}
