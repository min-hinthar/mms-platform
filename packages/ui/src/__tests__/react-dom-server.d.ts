/**
 * Phase 1c — the one `react-dom/server` export `toast.test.ts` renders with, typed here.
 *
 * `@mms/ui` takes `react-dom` as a PEER (the app owns the renderer) and carries no `@types/react-dom`,
 * so the package's typecheck reads `react-dom/server` as an untyped module (TS7016). Adding the types
 * package would rewrite the shared lockfile for one test helper; declaring the single function the
 * test calls is narrower. TypeScript prefers a resolved module over an ambient one, so this steps
 * aside on its own if the real types are ever installed here.
 */
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(node: ReactNode): string;
}
