# Epsu Next-Round Testing Guardrails

Date written: `May 19, 2026`
Purpose: prevent the setup mistakes and false signals that happened during the current manual QA round.

## Why This File Exists

This round found real product bugs, but it also introduced avoidable test pollution:

- SQL was used to approve pending Epsus, which skipped the real admin approval flow
- SQL approval also skipped admin-chosen logos
- some conclusions were delayed because setup shortcuts changed the normal app path
- some role tests were attempted before the required cause-effect state existed

This file is for the next round so the test stays clean and the results are easier to trust.

## Strengths Of This Round

- started from near-empty state, which exposed first-user experience issues
- used `1 Android` and `1 iPhone`, which surfaced platform-specific UI problems
- tested from guest/login/signup level instead of only logged-in flows
- forced real role progression: user, member, moderator, host, admin
- caught several logic mismatches between intended moderation design and actual code
- exposed weak areas in password reset, invite/deep-link behavior, and frontend sizing

## Weaknesses Of This Round

- backend shortcuts were used too early
- admin approval path was bypassed, so logo picking/cropping was not cleanly verified
- trial conversion demand forced account/email improvisation mid-session
- some tests were run before dependencies existed
- once bug count rose, the session turned from verification into discovery and patch triage

## Non-Negotiable Rule

If a feature has a real in-app button path, do not replace it with SQL until that real path has been tested once successfully or failed clearly.

## Hard Guardrails

1. Do not approve Epsus with SQL if the goal is to test admin approval UI.
   SQL approval is only allowed after:
   - admin has opened the pending request
   - logo picker behavior has been tested
   - crop behavior has been tested
   - approve button behavior has been tested

2. Do not use approval SQL that sets `review_status = 'approved'` unless the runbook explicitly says the admin approval flow is being skipped on purpose.

3. Do not create pending Epsus with the expectation that logos will somehow appear later.
   In the normal product path, logos are part of approval verification.

4. Do not seed trial members before at least one real join flow has been proven.
   Manual membership seeding is only allowed for filler accounts after:
   - one real signup is done
   - one real confirmation is done
   - one real login is done
   - one real join succeeds

5. Do not test moderator or admin actions before the queue state needed for them exists.
   Examples:
   - moderator tools are not meaningful without claims/reports/keyword cases
   - moderation team QR flow is not meaningful without host tools access
   - full-hour admin queue is not meaningful without queued posts

6. Do not mix “verify product” and “patch product” in the same uninterrupted run.
   Once core blockers pile up, stop the run, patch, rebuild, then restart from a clean checkpoint.

## SQL Usage Policy For Next Round

Allowed SQL:

- full backend reset before the run
- read-only inspection queries
- clearly labeled filler-member seeding after real join flow verification
- emergency cleanup if the run is already invalidated

Not allowed before relevant UI verification:

- auto-approving school or regional Epsus
- inserting host/mod/admin outcomes that skip buttons under test
- attaching logos behind the UI’s back
- changing queue state in ways users/admins could not do from the app

## Required Test Order

Use this sequence next time:

1. Fresh install and first-launch screens
2. Guest mode
3. Signup and email confirmation
4. Login
5. Password reset
6. Host creates school Epsu request
7. User creates regional Epsu request
8. Admin reviews both requests in UI
9. Admin picks logos and approves in UI
10. Member joins real approved Epsu
11. Host tools and moderator QR
12. Posting, reactions, replies
13. Reports and keyword moderation
14. Admin queue actions
15. Trial conversion with filler seeding only if still needed
16. Full-hour release checks

## Specific Mistakes Not To Repeat

### 1. Auto-approval SQL

What happened:

- pending Epsus were approved directly in SQL
- reopening admin made it look like the app had auto-approved them

Rule next time:

- if you want to test `Approve`, do not run any approval SQL beforehand

### 2. Logo Flow Contamination

What happened:

- because approval was forced in SQL, the normal logo selection requirement was skipped

Rule next time:

- school and regional approval must first be done through admin UI with chosen logo

### 3. Trial Member Pressure

What happened:

- needing many accounts during the same run created setup stress and shortcuts

Rule next time:

- pre-decide that only the final filler members may be seeded manually
- do not spend the live session inventing mailbox strategy

### 4. Queue Semantics Confusion

What happened:

- moderation queue expectations were stronger than the implemented logic

Rule next time:

- before moderation testing starts, confirm the intended queue semantics in one paragraph:
  - `Dismiss` clears case
  - `Remove` removes post only
  - `Mute 24h` mutes author only

### 5. Missing Platform Retests

What happened:

- some iPhone/Android differences were discovered late

Rule next time:

- any bug fixed for only one platform gets an explicit retest step on both phones after rebuild

## Pre-Run Questions To Answer Before Starting

The next session should not begin until these are answered:

1. Are we testing true admin approval UI, or are we intentionally skipping it?
2. Are trial filler members real accounts or seeded rows?
3. Which exact country will be used for the core role accounts?
4. Which Epsus will be seeded beforehand for guest-mode “alive” feel?
5. Are password reset links expected to be tested from app-installed and app-not-installed devices?

## Pass/Fail Standard For The Next Round

The run is valid only if:

- admin approval with logo picking is tested through UI
- at least one full end-to-end real join flow is completed
- at least one report/queue case is created naturally
- both phones run the current patched build
- SQL is used only where the runbook explicitly allows it

If any of those is broken, stop and classify the session as:

- `discovery run`, not final regression

## Recommended Companion Files

Run next time with:

- [MANUAL_QA_RUNBOOK_2026-05-19.md](/abs/path/C:/Users/jtruu/epsu/docs/MANUAL_QA_RUNBOOK_2026-05-19.md)
- this file

This file is the guardrail layer.
The runbook is the execution layer.
