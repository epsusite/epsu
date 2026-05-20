# Epsu Manual QA Runbook

Date: `May 19, 2026`
Local timezone for this run: `Europe/Tallinn`
Planned testing window: `15:00` to `17:15` local time

## Goal

Run one final full manual regression of the shipped app on `1 Android phone` and `1 iPhone`, starting from first-launch flows and continuing through:

- sign up
- login
- guest mode
- password reset
- school and regional Epsu creation
- admin approval
- host tools
- moderator QR flow
- posting, reactions, replies, reports, muting, removals
- account history and export
- push notifications
- trial Epsu conversion at `14` members
- both the `16:00` and `17:00` full-hour release cycles

The run must cover every visible button at least once in the state where that button is expected to succeed.

This version of the runbook uses a SQL approval checkpoint for pending trial Epsus instead of requiring you to log in as admin during setup.

## Source Basis

This runbook is based on:

- existing repo checklists in `LAUNCH_CHECKLIST.md`
- app navigation and role gating in `app.js`
- action rules in `lib/createCommunityActions.js`
- role/admin/moderation screens in the screen files
- Expo production-build and internal-testing guidance
- Android core app quality guidance

## Non-Negotiable Preconditions

These must be done before `15:00` or the run loses value.

1. Reset backend data so only the admin account remains.
   Use the SQL block in the `Backend Reset SQL` section of this file.
   Expected result after reset:
   - `auth.users = 1`
   - `profiles = 1`
   - `epsus = 0`
   - `epsu_memberships = 0`
   - `posts = 0`
   - `post_reports = 0`
   - `post_reactions = 0`
   - `app_notifications = 0`
   - `moderation_actions = 0`

2. Install fresh builds on both phones.
   - Android: latest rebuilt `apk`
   - iPhone: latest rebuilt test build

3. Remove old app state from both devices before install or before first open.
   - uninstall old build
   - reinstall latest build
   - verify first-launch intro appears

4. Prepare one square logo image on both phones.
   This is required because admin approval of school and regional Epsus needs a picked photo-library image.

5. Prepare real inbox access for all fresh accounts.
   The test depends on:
   - email confirmation links
   - password reset links
   - account-specific login reuse

6. Enable correct device settings.
   - both phones on stable internet
   - both phones with camera/browser/mail available
   - Android notifications allowed at OS level
   - iPhone notifications allowed at OS level
   - iPhone photo access available for admin approval if iPhone is used for that account at any point

7. Keep one shared test log open.
   For each step record:
   - time
   - account
   - device
   - action
   - result
   - screenshot if wrong

## Backend Reset SQL

Run this exact SQL in the Supabase SQL editor before testing:

```sql
do $$
declare
  v_admin_id uuid;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where lower(profile.email) = 'epsu.site@protonmail.com'
     or lower(profile.username) = 'admincat'
  order by case when lower(profile.email) = 'epsu.site@protonmail.com' then 0 else 1 end
  limit 1;

  if v_admin_id is null then
    raise exception 'Admin account not found';
  end if;

  delete from public.app_notifications;
  delete from public.post_reactions;
  delete from public.post_reports;
  delete from public.moderation_actions;
  delete from public.profile_push_tokens;
  delete from public.epsu_presence;
  delete from public.epsu_subscriptions;
  delete from public.epsu_trial_submissions;
  delete from public.epsu_suggestions;
  delete from public.epsu_memberships;
  delete from public.posts;
  delete from public.epsu_invites;
  delete from public.epsus;

  if to_regclass('public.profile_blocks') is not null then
    delete from public.profile_blocks;
  end if;

  if to_regclass('public.password_fingerprints') is not null then
    delete from public.password_fingerprints
    where profile_id <> v_admin_id;
  end if;

  update public.profiles
  set
    is_admin = case when id = v_admin_id then true else false end,
    notifications_enabled = false,
    date_of_birth = null,
    country_code = 'EE',
    tos_privacy_accepted_at = null,
    community_guidelines_accepted_at = null
  where id = v_admin_id;

  delete from auth.users
  where id <> v_admin_id;
end
$$;

select
  (select count(*)::int from auth.users) as auth_user_count,
  (select count(*)::int from public.profiles) as profile_count,
  (select count(*)::int from public.epsus) as epsu_count,
  (select count(*)::int from public.epsu_memberships) as membership_count,
  (select count(*)::int from public.posts) as post_count,
  (select count(*)::int from public.post_reports) as report_count,
  (select count(*)::int from public.post_reactions) as reaction_count,
  (select count(*)::int from public.app_notifications) as notification_count,
  (select count(*)::int from public.moderation_actions) as moderation_action_count,
  (select count(*)::int from public.profile_push_tokens) as push_token_count;

select
  id,
  username,
  email,
  is_admin,
  notifications_enabled,
  date_of_birth,
  country_code,
  tos_privacy_accepted_at,
  community_guidelines_accepted_at
from public.profiles
order by created_at asc;
```

## Trial Approval SQL Checkpoint

Use this once, after:

- Epsu A school request has been submitted by `host`
- Epsu B regional request has been submitted by `user`

This replaces the mid-run admin-login approval step.

```sql
do $$
declare
  school_epsu_id uuid;
  school_host_id uuid;
  regional_epsu_id uuid;
  regional_host_id uuid;
  reviewed_at_now timestamptz := timezone('utc', now());
begin
  select id, host_id
  into school_epsu_id, school_host_id
  from public.epsus
  where scope = 'school'
    and review_status = 'pending'
  order by created_at desc
  limit 1;

  if school_epsu_id is null then
    raise exception 'Pending school Epsu not found';
  end if;

  update public.epsus
  set review_status = 'approved',
      is_trial = true,
      trial_member_goal = 14,
      trial_started_at = reviewed_at_now,
      trial_ends_at = reviewed_at_now + interval '7 days',
      trial_converted_at = null,
      trial_created_by_profile_id = host_id
  where id = school_epsu_id;

  if school_host_id is not null then
    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (school_epsu_id, school_host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;
  end if;

  update public.epsu_trial_submissions
  set status = 'approved',
      reviewed_at = reviewed_at_now,
      approved_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where epsu_id = school_epsu_id
    and status = 'pending';

  perform public.convert_trial_epsu_if_ready(school_epsu_id);

  select id, host_id
  into regional_epsu_id, regional_host_id
  from public.epsus
  where scope in ('city', 'state', 'country')
    and review_status = 'pending'
  order by created_at desc
  limit 1;

  if regional_epsu_id is null then
    raise exception 'Pending regional Epsu not found';
  end if;

  update public.epsus
  set review_status = 'approved',
      is_trial = true,
      trial_member_goal = 14,
      trial_started_at = reviewed_at_now,
      trial_ends_at = reviewed_at_now + interval '7 days',
      trial_converted_at = null,
      trial_created_by_profile_id = host_id
  where id = regional_epsu_id;

  if regional_host_id is not null then
    insert into public.epsu_memberships (epsu_id, profile_id, role, status, muted_until)
    values (regional_epsu_id, regional_host_id, 'host', 'active', null)
    on conflict (epsu_id, profile_id)
    do update set
      role = 'host',
      status = 'active',
      muted_until = null;
  end if;

  update public.epsu_trial_submissions
  set status = 'approved',
      reviewed_at = reviewed_at_now,
      approved_at = reviewed_at_now,
      cooldown_until = reviewed_at_now + interval '7 days'
  where epsu_id = regional_epsu_id
    and status = 'pending';

  perform public.convert_trial_epsu_if_ready(regional_epsu_id);
end
$$;

select id, name, scope, review_status, is_trial, trial_member_goal, trial_started_at, trial_ends_at
from public.epsus
order by created_at asc;
```

Expected result:

- Epsu A becomes an approved school trial Epsu
- Epsu B becomes an approved regional trial Epsu
- both hosts get active host memberships
- both show trial fields populated

## Result Log Template

Use this simple template while testing:

```text
[time] [device] [account] [step]
Expected:
Actual:
Result: PASS / FAIL
Evidence:
Notes:
```

## Account And Device Assignment

Admin must stay on Android, per the test requirement.

### Core roles

- `admin` -> `epsu.site@protonmail.com` -> `Android`
- `host` -> fresh account -> `iPhone`
- `moderator` -> fresh account -> `Android`
- `member` -> fresh account -> `iPhone`
- `user` -> fresh account -> `Android`

### Extra trial accounts

- `extra-1` -> `Android`
- `extra-2` -> `iPhone`
- `extra-3` -> `Android`
- `extra-4` -> `iPhone`
- `extra-5` -> `Android`
- `extra-6` -> `iPhone`
- `extra-7` -> `Android`
- `extra-8` -> `iPhone`
- `extra-9` -> either device at end as the sacrificial delete-account test account

This split gives both phones real usage and makes QR scanning possible in both directions:

- first QR test: `host` on iPhone displays, `moderator` on Android scans
- second QR test: `admin` on Android can display a regenerated QR, an iPhone extra account can scan

## Test Data Strategy

Use two separate live Epsus during the run.

### Epsu A: primary school trial

Purpose:

- host tools
- moderator QR
- posting
- replies
- reports
- mute/remove
- full-hour release at `16:00` and `17:00`
- trial conversion to regular Epsu at `14` members

Owner:

- `host`

### Epsu B: sacrificial regional Epsu

Purpose:

- separate create-regional flow
- separate admin regional approval flow
- separate host delete-Epsu flow

Owner:

- `user`

Reason for this split:

- deleting the primary school trial would destroy the main run
- the delete button must still be tested in a real success state

## State Dependencies You Must Respect

These are the cause-effect rules that matter during execution.

1. Moderator QR only matters after a live owned Epsu exists.
   `OwnerTeam -> + -> Moderator QR` is only useful after admin has approved Epsu A.

2. Moderator queue will be empty unless a flagged or reported post exists.
   A moderator cannot meaningfully test `Investigate`, `Dismiss`, `Mute 24h`, or `Remove post` until content is in queue.

3. Worst users will be empty until moderation history exists.
   It needs prior removed-post or mute history before `Kick out` can be tested.

4. Delete Epsu should never be run on Epsu A before the full-hour tests are complete.

5. Account history export is low-value if the account has done nothing.
   Run it after posts, reactions, reports, memberships, and notifications exist.

6. Change password and delete account are destructive flows.
   Use sacrificial accounts after their main role in the run is finished.

7. Trial conversion needs `14` active members in the same trial Epsu.
   Do not spread the extras across multiple Epsus before conversion is confirmed.

8. Forgot password and reset password require inbox access and deep-link completion.
   Test them on one sacrificial fresh account early enough that failures can still be fixed.

9. Guest mode must be tested before any signed-in state assumptions contaminate the “first-time user” feel.

10. Admin approval of school and regional Epsus requires choosing a logo from photo library.
    No logo means approval should fail or stop.

## Timed Run

## 14:30 to 14:55 Preflight

1. Run `supabase/tmp/reset_for_manual_test.sql`.
2. Verify only `epsu.site@protonmail.com` remains.
3. Install fresh Android and iPhone builds.
4. Confirm first-launch intro appears on both devices.
5. Prepare one reusable square logo image on both phones.
6. Confirm local time is correct on both phones.
7. Confirm both phones can open `epsu.site` links externally.

## 15:00 to 15:20 First-Launch And Auth

### Android as first-time `user`

1. Open intro screen.
   Test:
   - `Continue`
   - `Understood`

2. On login screen test:
   - `Guest mode` bubble
   - invalid `Log In`
   - `Forgot password?`
   - `Create account`

3. In guest mode test:
   - country picker
   - `Start guest mode`
   - `Back`
   - attempt blocked actions from guest mode:
     - Post tab submit path
     - report path
     - react path
     - settings tab

4. Create fresh `user` account from sign-up.
   Test:
   - invalid email
   - weak password
   - age checkbox
   - terms checkbox
   - `Terms of Service`
   - `Privacy Policy`
   - country picker
   - valid `Create account`
   - confirmation email path
   - `Back to login`

### iPhone as first-time `host`

1. Repeat intro flow once on iPhone.
2. Repeat login -> sign-up path once on iPhone.
3. Create fresh `host` account successfully.

### Sacrificial reset-password account

1. Create one additional fresh account only for auth testing.
2. Run `Forgot password`.
3. Open the reset email link on-device.
4. Complete `Update password`.
5. Log in with the new password.

Pass condition for this block:

- both phones complete first-launch
- guest mode works and correctly blocks privileged actions
- sign-up works on both platforms
- password reset deep link works at least once

## 15:20 to 15:40 Create The Two Test Epsus

### Epsu A on iPhone as `host`

1. Go to `Home`.
2. Tap `School Epsus`.
3. Tap `Create school Epsu`.
4. Test school form:
   - invalid website
   - valid website
   - `Submit`
5. Expect pending-review confirmation.

### Epsu B on Android as `user`

1. Go to `Home`.
2. Tap `Regional Epsus`.
3. Tap `Create regional Epsu`.
4. Test regional form:
   - empty location
   - valid location
   - `Submit`
5. Expect pending-review confirmation.

### Admin approvals on Android as `admin`
1. Run the `Trial Approval SQL Checkpoint` section in this file.
2. Verify the final `select` shows both Epsus as `approved` and `is_trial = true`.

Pass condition for this block:

- Epsu A becomes a live school trial Epsu
- Epsu B becomes a live regional trial Epsu
- both approval flows succeed via SQL checkpoint

## 15:40 to 15:55 Role Setup And Membership Setup

### Moderator QR

1. Log into `host` on iPhone.
2. Open Epsu A -> host tools.
3. Test:
   - `Moderation team`
   - empty-state plus button
   - `+`
   - `Generate new QR`
4. With `moderator` account on Android:
   - scan QR
   - verify app link opens the app directly
   - redeem moderator invite
   - verify moderator role appears in moderation team

### Public joins for members

1. Log into `member` on iPhone and join Epsu A through the normal Home browse flow.
2. Log into `user` on Android and join Epsu A through the same normal flow.
3. Log into `admin` on Android and join Epsu A if the app exposes the join/access path cleanly for admin.
4. Start creating and joining with `extra-1` through `extra-8` until Epsu A reaches at least `12` visible members before `16:00`.
   Hold back the last `2` joiners for after some moderation actions, so trial conversion can be observed deliberately.

### Separate delete-flow owner

1. Log into `user`.
2. Open Epsu B.
3. Verify `Host tools` is available for Epsu B.
4. Do not delete it yet.

Pass condition for this block:

- moderator QR works
- moderator role redemption works
- Epsu A has enough members lined up for the trial-conversion finish later
- Epsu B is live and preserved for later delete-Epsu testing

## 15:55 to 16:10 First Full-Hour Cycle

Use Epsu A only.

Before `16:00`, create queued content from multiple accounts:

- `host` creates top-level post A1
- `member` creates top-level post A2
- `user` creates top-level post A3 with intentionally reportable content but not keyword-trigger content
- `moderator` creates top-level post A4 with intentionally keyword-trigger content if possible
- one extra account creates a reply to one of the existing posts

At `16:00` verify:

1. queued posts release
2. active-post counts refresh
3. full-hour notifications arrive where enabled
4. opening notification refreshes feed correctly
5. Home feed shows released content in Epsu A
6. post numbering is sensible
7. reply context opens correctly

Important observation:

- record the exact local time when the release actually becomes visible
- record whether the app’s countdown, queue state, and notifications agree
- treat any disagreement between countdown text and actual release timing as a real bug, not tester error

## 16:10 to 16:35 Feed, Reactions, Reports, Moderation

### Normal feed actions

Using `user`, `member`, `host`, and one extra:

1. open each released post
2. swipe right to like
3. swipe left to dislike
4. verify duplicate reaction behavior
5. reply to a post
6. report a post
7. use `Block author`
8. confirm blocked author content disappears from that account’s feed

### Moderator queue actions on Android as `moderator`

Create at least these queue states:

- one user-reported-only post
- one keyword-flagged-only post
- one post that is both flagged and reported

Then test:

1. Epsu A -> `Mod Queue`
2. queue card `Investigate`
3. `Dismiss`
4. `Mute 24h`
5. `Remove post`

Verify outcomes:

- dismiss removes the queue item
- mute prevents that member from posting for `24h`
- removed post no longer appears in feed
- report and/or flagged state clears correctly

### Host oversight

As `host` on iPhone:

1. open `Moderation team`
2. verify moderator appears
3. open `Worst users`
4. once moderation history exists, verify entry appears
5. test `Kick out` on the targeted bad actor only after mute/remove history is visible

Pass condition for this block:

- every moderation action has been exercised from a real queue state
- mute and remove have visible downstream effects
- worst-users list is populated from real prior actions

## 16:35 to 16:50 Settings, History, Team Management

### Settings

Test on at least `member` and `host`, and once on `admin`.

Buttons and actions:

- `Change password`
- notifications toggle on
- notifications toggle off
- `Account history`
- `Download data file`
- `Help`
- `Terms of Service`
- `Community Guidelines`
- `Privacy Policy`
- `Log out`
- `Delete account` only on a sacrificial account
- `Administration` on admin only

### Team management

As `host`:

1. open `Moderation team`
2. test `Demote` on the moderator
3. generate a new QR again
4. re-promote by redeeming fresh QR with a spare iPhone extra account if desired

Reason:

- `Demote` must be tested without permanently losing your only active moderator before the second release

Recommended order:

1. demote current moderator
2. confirm team list updates
3. immediately create a fresh moderator from a spare extra account

## 16:50 to 17:00 Finish Trial Conversion Preconditions

1. Join the remaining held-back extra accounts into Epsu A until total active membership reaches `14`.
2. Verify the Home browse card for Epsu A changes from:
   - trial label like `x/14 members to become permanent`
   to
   - normal member-count label
3. Record:
   - exact account that triggered the `14th` member
   - exact time conversion became visible

If conversion does not happen automatically:

- refresh Home
- reopen the Epsu
- relog one account if necessary
- record failure precisely as a backend or realtime bug

## 17:00 to 17:15 Second Full-Hour Cycle And Destructive Final Checks

Before `17:00`, create one more small batch in Epsu A:

- one clean post
- one reply
- one reportable post

At `17:00` verify again:

1. second queued release works
2. notifications still behave after all prior actions
3. converted former-trial Epsu behaves like a regular Epsu

### Final destructive checks

Run these only after all core evidence is already captured.

1. `Delete account`
   Use `extra-9`.
   Verify:
   - password confirmation
   - destructive confirmation dialog
   - account can no longer log in

2. `Delete Epsu`
   Use Epsu B owned by `user`.
   Verify:
   - exact-name confirmation gate
   - `Submit`
   - Epsu disappears from browse/feed/host tools

3. Admin queue ignore path
   If a queued admin item remains, test `Ignore`.

4. Optional deferred admin-screen pass
   If you still want visible admin button coverage later, log into `admin` after core testing and test:
   - `Administration`
   - `Administrator queue`
   - `Release queued posts now`
   - `Refresh admin lists`
   This is now optional because trial approval itself was moved to SQL.

## Screen And Button Coverage Checklist

Use this as the “every button” audit.

### Intro

- `Continue`
- `Understood`

### Login

- guest bubble
- `Log In`
- `Forgot password?`
- `Create account`

### Guest mode

- country picker open/select
- `Start guest mode`
- `Back`

### Sign up

- country picker
- age checkbox
- terms checkbox
- `Terms of Service`
- `Privacy Policy`
- `Create account`
- `Back to login`

### Forgot password

- `Send reset link`
- `Back to login`

### Reset password

- `Update password`

### Post tab

- Epsu search
- Epsu select
- clear selected Epsu
- `CANCEL REPLY`
- submit post button
- community-guideline acceptance path if shown

### Home browse

- `School Epsus`
- `Regional Epsus`
- search input
- Epsu card tap
- `Create school Epsu`
- `Create regional Epsu`

### Feed / post card

- swipe like
- swipe dislike
- `Report`
- `Reply`
- `Block author`
- `Leave Epsu` where allowed
- host/admin route buttons into tool screens

### Report

- all report reasons

### Host tools

- `Moderation team`
- `Worst users`
- `Delete Epsu`

### Moderation team

- `Demote`
- `+`

### Moderator QR

- `Generate new QR`

### Worst users

- `Kick out`

### Regional creation

- `Submit`

### School creation

- `Submit`

### Delete Epsu

- `Submit`

### Settings

- `Change password`
- notifications toggle
- `Account history`
- `Download data file`
- `Help`
- `Terms of Service`
- `Community Guidelines`
- `Privacy Policy`
- `Log out`
- `Delete account`
- `Administration`

### Administration

- `Administrator queue`
- `Release queued posts now`
- `Refresh admin lists`

The four pending-review buttons below are no longer mandatory in this version because approval is done through SQL:

- school `Reject`
- school `Approve`
- regional `Reject`
- regional `Approve`

### Moderator queue / admin queue

- `Investigate`
- `Dismiss`
- `Ignore`
- `Mute 24h`
- `Remove post`

## Evidence To Capture

Take screenshots or short screen recordings for:

- first-launch intro on both phones
- guest-mode timer
- successful sign-up confirmation
- password reset link completion
- admin approval screens
- moderator QR visible
- QR scan opening the app
- first queue before `16:00`
- released feed after `16:00`
- moderator investigation screen
- muted member blocked from posting
- removed post absent from feed
- worst-users populated
- trial label before `14/14`
- regular Epsu label after conversion
- second full-hour release at `17:00`
- successful delete-account result
- successful delete-Epsu result

## Fail Classification

Mark any issue with one of these severities.

- `P0`: data loss, broken auth, broken release cycle, broken deep links, broken trial conversion
- `P1`: core action broken for one role, moderator/admin queue incorrect, QR redemption broken, delete flows incorrect
- `P2`: UI defect, stale counters, incorrect copy, refresh inconsistency, delayed realtime update

## Go / No-Go

This run is a `NO-GO` if any of these fail:

- fresh sign-up fails on either platform
- password reset deep link fails
- admin cannot approve school or regional requests
- moderator QR redemption fails
- `16:00` or `17:00` release fails
- reports do not reach moderator/admin review
- mute or remove does not change downstream behavior
- trial Epsu does not convert at `14` members
- delete account or delete Epsu behaves unsafely

## External Inspiration

- Expo production and internal testing docs: `https://docs.expo.dev/deploy/build-project/`
- Expo Android production-build tutorial: `https://docs.expo.dev/tutorial/eas/android-production-build/`
- Android core app quality test guidance: `https://developer.android.com/tools/testing/what_to_test`
