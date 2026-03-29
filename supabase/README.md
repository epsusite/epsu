# Supabase Start

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. In the Supabase SQL editor, run [`schema.sql`](C:/Users/jtruu/epsu/supabase/schema.sql).

Current schema covers:
- profiles
- epsus
- epsu memberships
- posts
- post reactions
- post reports
- epsu subscriptions

This matches the app's current concepts so we can move off local-only state incrementally instead of rewriting the product model.
