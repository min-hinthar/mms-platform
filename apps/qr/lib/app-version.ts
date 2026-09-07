/**
 * P7·4 — the deployed build, as a report can name it. Vercel exposes the commit as
 * `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` when "Automatically expose System Environment Variables" is
 * on for the project (OPEN-ITEMS C17 asks the owner to confirm it); inlined at build, so it is the
 * same string on the server and the client. `dev` otherwise — never a fabricated version.
 */
export const APP_VERSION: string =
  (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev";
