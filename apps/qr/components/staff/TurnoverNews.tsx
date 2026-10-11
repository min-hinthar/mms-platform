"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ERR_DWELL_MS } from "@/lib/kds-errors";
import type { StaffKeyMsg } from "@/lib/staff-send-view";

/**
 * PD7 (m7 B10) — THE TURNOVER LINE. A clear's outcome ("Table 2 is free." · "Table 4 cleared — 3
 * dishes on the loss list." · "Table 2 is clear — tap 2 on the strip to seat them.") is said on the
 * FLOOR, in the board's ONE region, because the pane the clear was tapped in leaves with the table:
 * a line said there unmounts in the same render and nobody hears it. The provider sits in
 * `CounterSplit`, above both the board and the pane; the board renders the line, the pane's clear
 * hands it up. Absent (the full table page, a phone): nobody holds it, and the floor the page returns
 * to shows the table free.
 *
 * `tone` — `calm` for a table freed, `warn` for the one line that asks a hand (the seat that did not
 * happen). One line at a time: a newer outcome replaces an older one; each dwells `ERR_DWELL_MS` (the
 * region's other notices' dwell — one binding) and then the counts come back.
 */
export type TurnoverLine = { msg: StaffKeyMsg; tone: "calm" | "warn"; seq: number };

type TurnoverNewsApi = {
  line: TurnoverLine | null;
  say: (msg: StaffKeyMsg, tone?: "calm" | "warn") => void;
};

const Ctx = createContext<TurnoverNewsApi | null>(null);

export const TURNOVER_DWELL_MS = ERR_DWELL_MS;

export function TurnoverNewsProvider({ children }: { children: ReactNode }) {
  const [line, setLine] = useState<TurnoverLine | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const say = useCallback((msg: StaffKeyMsg, tone: "calm" | "warn" = "calm") => {
    seq.current += 1;
    setLine({ msg, tone, seq: seq.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setLine(null);
    }, TURNOVER_DWELL_MS);
  }, []);
  return <Ctx.Provider value={{ line, say }}>{children}</Ctx.Provider>;
}

/** The turnover line's channel, or null outside the counter's split (the full table page). */
export function useTurnoverNews(): TurnoverNewsApi | null {
  return useContext(Ctx);
}
