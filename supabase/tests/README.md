# supabase/tests

Database-level tests that run against a real Postgres with the project's migrations applied — the only
place RLS, triggers, and SECURITY DEFINER grants can be proven (they're invisible to TypeScript).

## rls_membership_test.sql (M3·P3.4)

Negative + positive RLS membership tests for the group-cart / split-tender surface: a non-member of a
table session cannot read another table's session/members/cart/items/shares/order rows; a member can read
their own. Plain-SQL `assert`s (no pgTAP dependency) wrapped in a transaction that **rolls back** — it
leaves no data.

Run it:

```bash
# against the local stack (supabase start)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_membership_test.sql

# or any DB
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_membership_test.sql
```

A failed assertion aborts with a non-zero exit (so CI goes red). CI runs this on every push in
`.github/workflows/ci.yml` (the `supabase` job, after the local stack is up).

It impersonates a diner the same way the app's anon-auth does: `set local role authenticated` +
`set local request.jwt.claims` so `auth.uid()` (and thus `is_member`/`is_host`) evaluate the real policies.
