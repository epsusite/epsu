# Supabase Start

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. In the Supabase SQL editor, run [`schema.sql`](C:/Users/jtruu/epsu/supabase/schema.sql).
5. Then run the files in [`migrations/`](C:/Users/jtruu/epsu/supabase/migrations) in timestamp order.

Notes:
- `schema.sql` is the current bootstrap snapshot for the public tables.
- The real policies, triggers, RPCs, and later behavior changes are defined in the timestamped files in `migrations/`.
- `migrations_legacy/` contains older non-timestamped files kept only for historical reference.
- `manual-sql/` is legacy and should not be treated as the source of truth for a fresh setup.
