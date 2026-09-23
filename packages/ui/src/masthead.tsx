import type { ReactNode } from "react";

/**
 * Kicker + PageMasthead — the ONE page heading (Phase 0).
 *
 * The audit counted nine eyebrow/kicker treatments on five tracking values, and page titles at 400
 * (Tailwind's reset overriding the prototype), 600 and an inline 900. A page now says what it is in
 * one shape: kicker → title (display face, one weight) → optional Burmese line → optional lede.
 * Server-Component safe (no hooks).
 */
export function Kicker({ children, mark = false }: { children: ReactNode; mark?: boolean }) {
  return (
    <p className="ui-kicker">
      {mark ? <span aria-hidden>✦</span> : null}
      {children}
    </p>
  );
}

export function PageMasthead({
  kicker,
  kickerMark = false,
  title,
  titleMy,
  lede,
  size = "h1",
  align = "start",
  children,
}: {
  kicker?: ReactNode;
  /** Lead the kicker with the ✦ Morning Star mark (the brand's own pages). */
  kickerMark?: boolean;
  title: ReactNode;
  /** The Burmese line under the title — its own `lang="my"` paragraph on the Padauk stack. */
  titleMy?: ReactNode;
  lede?: ReactNode;
  /** `display` for a landing page's wordmark-scale title; `h1` for every other page. */
  size?: "h1" | "display";
  align?: "start" | "center";
  /** Anything that belongs to the heading block (a back link, a status chip). */
  children?: ReactNode;
}) {
  return (
    <header className="ui-masthead" data-align={align}>
      {kicker ? <Kicker mark={kickerMark}>{kicker}</Kicker> : null}
      <h1 className="ui-masthead-title" data-size={size}>
        {title}
      </h1>
      {titleMy ? (
        <p lang="my" className="ui-masthead-my">
          {titleMy}
        </p>
      ) : null}
      {lede ? <p className="ui-masthead-lede">{lede}</p> : null}
      {children}
    </header>
  );
}
