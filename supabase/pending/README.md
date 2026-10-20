# Printed for audit — NOT applied

Migrations here are written and reviewable but have **not** been run against
the database. They live outside `supabase/migrations/` on purpose: the policy
suite builds its function-exposure inventory from every `.sql` in that folder,
so an unapplied file there makes `npm run db:gate` fail on functions that do
not exist yet.

To apply one after audit:

1. `git mv supabase/pending/<file>.sql supabase/migrations/`
2. `npm run db:apply -- supabase/migrations/<file>.sql`
3. Land the suite changes listed at the foot of the file.
4. `npm run db:gate` — green before anything is built on it.
5. Flip the feature flag the file names, if any.
