# Epsu Analytics Plan

This file records the plan to add proper analytics later instead of relying only on manual SQL checks.

## Goal

Connect two analytics systems in the future:

- `Metabase`
- `PostHog`

## Why Both

### Metabase

Use Metabase for database and business statistics:

- users
- posts
- replies
- reports
- school applications
- per-Epsu activity
- moderation load
- growth by Epsu

Metabase should answer:

- what exists in the database
- which Epsus are active
- how much moderation is happening
- which communities are growing or dying

### PostHog

Use PostHog for product and behavior analytics:

- signups
- screen opens
- posting flow completion
- school application flow completion
- swipe usage
- report flow usage
- retention
- drop-off points

PostHog should answer:

- what users actually do in the app
- where they stop using flows
- whether onboarding works
- whether users come back

## Access Model

### Admin

Admin should have the broadest analytics access:

- global app statistics
- per-Epsu statistics
- moderation trends
- retention and usage funnels

### Hosts

Hosts should only see data relevant to their own Epsu:

- local active users
- posts
- replies
- reports
- pending applications
- moderation-related counts

Hosts should not see cross-Epsu data.

## Implementation Direction

- connect Metabase to Supabase/Postgres
- connect PostHog to the mobile app for event tracking
- use admin-first access
- only later expose filtered host dashboards

## Priority

Not immediate for launch.

This should happen after:

- soft launch
- early traction validation
- support email setup
- basic launch stabilization
