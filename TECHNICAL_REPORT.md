# Epsu Technical Report

## 1. Executive Summary

Epsu is a mobile-first anonymous community application implemented as a single Expo / React Native client backed directly by Supabase. There is no separate custom backend server in this repository. Instead, the mobile app talks from client code to Supabase Auth and Postgres through the `@supabase/supabase-js` SDK using a publishable anon key. The repository also contains a small static web property under [`site/`](C:\Users\jtruu\epsu\site) that acts as the public/legal surface and as a human-readable invite landing flow for membership and moderator access.

Functionally, the product model is:

- A user creates an account with email/password.
- The user browses one or more "Epsus", which are location-scoped communities.
- The user posts anonymously into an Epsu.
- Other users react with like/dislike.
- Posts can be soft-removed automatically by reaction threshold logic or manually by moderators.
- Reports create a moderation queue.
- Owners can approve members, issue one-time invites, manage moderators, inspect moderation stats, and delete an Epsu.

Architecturally, this is a direct-client system. Most business logic currently lives in two places:

- The top-level React component in [`app.js`](C:\Users\jtruu\epsu\app.js), which owns the application state machine, bootstrapping, and orchestration.
- The Supabase adapter in [`lib/epsuApi.js`](C:\Users\jtruu\epsu\lib\epsuApi.js), which implements CRUD-style domain operations over the database.

That makes the current codebase simple to move quickly in, but it also means trust boundaries are weak compared to a production-grade service architecture. Any operation that should be permissioned or transactionally serialized is currently exposed as client-callable database activity unless Supabase-side policies exist outside the repo. No Row Level Security policy definitions are present in the SQL checked into this repository, and no server-side Edge Functions are present here.

## 2. Repository Topology

Top-level layout:

- [`app.js`](C:\Users\jtruu\epsu\app.js): main application entry and navigation tree.
- [`index.js`](C:\Users\jtruu\epsu\index.js): Expo root registration.
- [`app/app.js`](C:\Users\jtruu\epsu\app\app.js): re-export shim to `../app`.
- Screen files in repo root:
  - [`LoginScreen.js`](C:\Users\jtruu\epsu\LoginScreen.js)
  - [`SignUpScreen.js`](C:\Users\jtruu\epsu\SignUpScreen.js)
  - [`HomeScreen.js`](C:\Users\jtruu\epsu\HomeScreen.js)
  - [`PostScreen.js`](C:\Users\jtruu\epsu\PostScreen.js)
  - [`ModQueueScreen.js`](C:\Users\jtruu\epsu\ModQueueScreen.js)
  - [`OwnerToolsScreen.js`](C:\Users\jtruu\epsu\OwnerToolsScreen.js)
  - [`OwnerMembersScreen.js`](C:\Users\jtruu\epsu\OwnerMembersScreen.js)
  - [`OwnerTeamScreen.js`](C:\Users\jtruu\epsu\OwnerTeamScreen.js)
  - [`OwnerAccessScreen.js`](C:\Users\jtruu\epsu\OwnerAccessScreen.js)
  - [`OwnerWorstUsersScreen.js`](C:\Users\jtruu\epsu\OwnerWorstUsersScreen.js)
  - [`OwnerModInviteScreen.js`](C:\Users\jtruu\epsu\OwnerModInviteScreen.js)
  - [`JoinInviteScreen.js`](C:\Users\jtruu\epsu\JoinInviteScreen.js)
  - [`ReportScreen.js`](C:\Users\jtruu\epsu\ReportScreen.js)
  - [`DeleteEpsuScreen.js`](C:\Users\jtruu\epsu\DeleteEpsuScreen.js)
  - [`RentEpsuScreen.js`](C:\Users\jtruu\epsu\RentEpsuScreen.js)
  - [`SettingsScreen.js`](C:\Users\jtruu\epsu\SettingsScreen.js)
- [`lib/supabase.js`](C:\Users\jtruu\epsu\lib\supabase.js): Supabase client bootstrap.
- [`lib/epsuApi.js`](C:\Users\jtruu\epsu\lib\epsuApi.js): domain API wrapper over Supabase tables.
- [`supabase/schema.sql`](C:\Users\jtruu\epsu\supabase\schema.sql): schema bootstrap.
- [`supabase/migrations/`](C:\Users\jtruu\epsu\supabase\migrations): follow-up DDL.
- [`site/`](C:\Users\jtruu\epsu\site): static website and document pages.
- [`app.json`](C:\Users\jtruu\epsu\app.json): Expo app manifest.
- [`eas.json`](C:\Users\jtruu\epsu\eas.json): EAS build profiles and public env injection.
- [`package.json`](C:\Users\jtruu\epsu\package.json): runtime and dev dependencies.

There is also legacy Expo template material under [`components/`](C:\Users\jtruu\epsu\components), [`constants/`](C:\Users\jtruu\epsu\constants), and [`hooks/`](C:\Users\jtruu\epsu\hooks), but the shipped app does not materially depend on most of that starter structure.

## 3. Runtime Stack

### 3.1 Client runtime

The mobile app stack is:

- Expo SDK 54
- React 19.1
- React Native 0.81
- React Navigation 7
- `@supabase/supabase-js` 2.x
- AsyncStorage for persisted auth session
- `react-native-qrcode-svg` for invite QR code generation

Primary dependencies from [`package.json`](C:\Users\jtruu\epsu\package.json):

- `expo`
- `react`
- `react-native`
- `@react-navigation/native`
- `@react-navigation/native-stack`
- `@react-navigation/bottom-tabs`
- `@supabase/supabase-js`
- `@react-native-async-storage/async-storage`
- `react-native-safe-area-context`
- `react-native-gesture-handler`
- `react-native-screens`

This is a classic client-heavy architecture with no state management framework like Redux, Zustand, MobX, or React Query. All durable state comes from Supabase, but all runtime orchestration is manual React state in the root component.

### 3.2 Backend runtime

The effective backend is Supabase:

- Auth: email/password authentication.
- Database: Postgres for domain tables.
- Storage: available on platform, but not used by app code.
- Realtime: available on platform, but not used by app code.
- Edge Functions: not present in this repository.

The consequence is important: the app has backend infrastructure, but not a custom backend code tier. Supabase is acting as auth provider, database host, and database API gateway.

### 3.3 Web surface

The static site in [`site/`](C:\Users\jtruu\epsu\site) is plain HTML/CSS. It is configured for Render static hosting via [`site/render.yaml`](C:\Users\jtruu\epsu\site\render.yaml). There is no JavaScript framework on the public site. Only the invite pages contain a tiny inline script that echoes `window.location.href` into the document.

## 4. Application Boot Sequence

The full boot and hydration flow in [`app.js`](C:\Users\jtruu\epsu\app.js) is:

1. The app instantiates a Supabase client through `requireSupabase()`.
2. Root state is initialized for auth, user profile display fields, Epsus, posts, memberships, moderator scope, owner scope, and reports.
3. `useEffect` runs initialization.
4. `supabase.auth.getSession()` checks for an existing persisted session.
5. If a session exists, `hydrateUser(session.user)` is called.
6. `hydrateUser` loads profile data from `profiles`.
7. `hydrateUser` sets UI-level identity state:
   - `currentUsername`
   - `currentEmail`
   - `notificationsEnabled`
   - `currentPasswordLength`
   - `isAuthenticated`
8. `hydrateUser` then calls `syncStaticEpsus()`, which seeds a static catalog of city Epsus from client code into the database on every authenticated boot.
9. `hydrateUser` calls `ensurePrototypeRoles(user.id)`, which force-upserts owner/moderator memberships for several hard-coded prototype Epsus.
10. The app concurrently loads:
   - Epsus
   - active posts
   - posts already reacted to by the user
   - posts already reported by the user
   - Epsus the user can moderate
   - Epsus the user owns
   - memberships for the current user
11. It then loads owner-only and moderator-only secondary data:
   - all memberships for owned Epsus
   - open reports for moderated Epsus
12. State is committed into the root component.
13. An auth state subscription is registered with `supabase.auth.onAuthStateChange`.
14. On logout or session loss, the app clears all loaded arrays and returns to auth screens.

This means the app is not lazy-loading per screen. It eagerly loads a large portion of the application graph after login.

## 5. Application State Model

The root state in [`app.js`](C:\Users\jtruu\epsu\app.js) is the operational truth for the whole client:

- `isAuthenticated`
- `currentUsername`
- `currentEmail`
- `notificationsEnabled`
- `currentPasswordLength`
- `isReady`
- `epsus`
- `posts`
- `reviewedPostIdsByEpsu`
- `reportedPostIds`
- `moderatedEpsuIds`
- `ownedEpsuIds`
- `memberships`
- `userMemberships`
- `reports`

Observations:

- There is no normalized entity store. Arrays are filtered repeatedly.
- There is no cache invalidation layer beyond manual `setState`.
- There is no optimistic rollback system.
- There is no pagination anywhere.
- There is no websocket subscription for incremental updates.
- Refresh after mutations is mixed: some flows mutate local state directly; some re-fetch subsets; some do neither fully.

## 6. Navigation and Menu Layout

### 6.1 Top-level auth split

If not authenticated, the app renders a stack navigator with two screens:

- `Login`
- `SignUp`

These screens are visually full-screen branded auth pages using a background image and pink overlay controls.

### 6.2 Authenticated tab bar

Once authenticated, the app renders a bottom tab navigator with three tabs:

- `Post`
- `Home`
- `Settings`

Tab bar characteristics:

- Custom pink bar background `#e52b50`
- White icons
- Uses safe-area insets to compute height
- Header hidden globally

The `Post` tab uses a custom icon that becomes a plus sign layered over an `ellipse` icon when focused.

### 6.3 Home stack

The `Home` tab contains a nested native stack:

- `HomeMain`
- `HomeEpsu`
- `ModQueue`
- `Investigation`
- `OwnerTools`
- `OwnerTeam`
- `OwnerMembers`
- `OwnerAccess`
- `OwnerWorstUsers`
- `OwnerModInvite`
- `JoinInvite`
- `DeleteEpsu`
- `ReportReason`
- `ReportExplanation`
- `RentEpsu`

The app includes special tab press listeners so tapping `Home` while already focused resets nested navigation back to `HomeMain`.

### 6.4 Settings stack

The `Settings` tab contains:

- `SettingsMain`
- `ChangePassword`
- `DeleteAccount`

It also has the same reset-to-root tab press behavior.

### 6.5 Practical menu topology

The real user-visible menu structure is:

- Bottom tabs
  - Post
  - Home
  - Settings
- Home screen list actions
  - Use invite
  - Search your Epsus
  - Rent a new Epsu
  - Enter Epsu
- Inside an Epsu
  - Mod Queue, if moderator or owner
  - Owner Tools, if owner
  - Report
  - Reply
- Owner Tools
  - Members
  - Moderation team
  - Access and invite
  - Worst users
  - Delete Epsu
- Moderation team
  - Make mod / Remove mod
  - FAB to generate moderator invite
- Members
  - Approve pending member
  - Decline pending member
- Access and invite
  - View one-time member invite
  - View QR code
  - Generate new invite
- Settings
  - Change password
  - Notifications
  - Plan
  - Renewal date
  - Cancel / renew
  - Terms
  - Guidelines
  - Privacy
  - Log out
- Delete account
- Random food easter egg

## 7. Frontend Mechanics by Screen

### 7.1 Login and signup

[`LoginScreen.js`](C:\Users\jtruu\epsu\LoginScreen.js):

- Validates email presence and format.
- Validates password presence.
- Calls `onLogin`.
- Surfaces field errors inline.

[`SignUpScreen.js`](C:\Users\jtruu\epsu\SignUpScreen.js):

- Validates:
  - username required and min 8 chars
  - email required and regex-valid
  - password required and min 8 chars
- Shows a password strength indicator based only on length.
- Calls `onSignUp`.

Auth UX is manual and direct. There is no form library, no debounce, no captcha, no anti-automation layer in client code.

### 7.2 Home screen

[`HomeScreen.js`](C:\Users\jtruu\epsu\HomeScreen.js) implements two distinct modes:

- Epsu selection mode when no `epsuId` is in route params
- In-Epsu feed mode when a specific Epsu is selected

Epsu selection mode:

- Builds an accessible list of Epsus from:
  - all `city` scope Epsus, plus
  - non-city Epsus where the user has membership
- Injects a synthetic first item:
  - `id: "rent-epsu"`
  - `code: "???"`
  - `name: "Rent a new Epsu"`
- Supports client-side text filtering
- Computes "NEW POSTS" badges by comparing total posts in an Epsu with the set of post IDs the user has reacted to in that Epsu
- Disables entry into an invited-but-not-yet-approved membership

In-Epsu mode:

- Filters posts to the selected Epsu
- Selects the first unread/unrated post
- Shows moderation and owner tool shortcuts conditionally
- Renders a swipe-like moderation card UI, but implemented as double-tap on left/right hit zones rather than gesture recognition
- Left side means dislike
- Right side means like
- Report and Reply are separate buttons under the card

Important behavioral implication:

- The "feed" is not a scrolling timeline.
- It is a single-card queue of unrated posts.
- A post is effectively "consumed" once the user reacts.

### 7.3 Post creation

[`PostScreen.js`](C:\Users\jtruu\epsu\PostScreen.js):

- Accepts reply context from navigation params.
- Requires:
  - selected Epsu
  - title length >= 1
  - body length >= 1
- Limits:
  - title <= 100
  - body <= 1000
- Animates the submit button opacity when the form becomes submittable.
- On submit:
  - calls `onSubmitPost`
  - clears local fields
  - navigates to `Home -> HomeEpsu` for the selected Epsu

The Epsu picker is search-driven and intentionally hides choices until the user types search input or already selected an Epsu.

### 7.4 Reporting

[`ReportScreen.js`](C:\Users\jtruu\epsu\ReportScreen.js) is a two-step flow:

Step 1:

- Present fixed reason categories:
  - Nudity or sexual activity
  - Harassment or bullying
  - Hate speech or symbols
  - Violence or dangerous organizations
  - Scam, spam or fraud
  - False information
  - Suicide, self-injury or eating disorders
  - Illegal goods or criminal activity

Step 2:

- Require a free-text explanation between 10 and 1000 trimmed characters.
- Submit by concatenating reason + blank line + explanation.

This means the database stores category and explanation in a single `reason` text field using a delimiter convention, not a normalized schema.

### 7.5 Moderation queue

[`ModQueueScreen.js`](C:\Users\jtruu\epsu\ModQueueScreen.js) has two modes:

- `queue`
- `investigation`

Queue mode:

- Filters open reports for the selected Epsu.
- Groups them by `post.id`.
- Enriches each grouped post with current like/dislike counts from live post state.
- Computes dislike percentage.
- Shows one queue item per reported post.

Investigation mode:

- Loads all report entries for a given post.
- Shows moderator actions:
  - Dismiss
  - Mute 24h
  - Remove post

Moderation actions are thin wrappers over root handlers which in turn call database update functions.

### 7.6 Owner tools

[`OwnerToolsScreen.js`](C:\Users\jtruu\epsu\OwnerToolsScreen.js):

- Calculates moderator count, pending member count, and active member count from preloaded membership data.
- Renders the owner control menu.

[`OwnerMembersScreen.js`](C:\Users\jtruu\epsu\OwnerMembersScreen.js):

- Splits memberships into:
  - pending (`status === invited`)
  - active/non-pending
- Supports approve and decline actions

[`OwnerTeamScreen.js`](C:\Users\jtruu\epsu\OwnerTeamScreen.js):

- Fetches moderator action stats via `fetchModeratorStats`
- Shows per-moderator action counts
- Allows member promotion to moderator
- Allows moderator demotion back to member
- Includes FAB to create a moderator invite

[`OwnerAccessScreen.js`](C:\Users\jtruu\epsu\OwnerAccessScreen.js):

- Calls `onEnsureInvite(epsuId, "member")`
- Displays one-time invite link
- Displays QR code for the link
- Can rotate invite by generating a new one

[`OwnerModInviteScreen.js`](C:\Users\jtruu\epsu\OwnerModInviteScreen.js):

- Same mechanics as owner access but for `inviteRole = "moderator"`
- Uses `https://epsu.site/mod.html?token=...`

[`OwnerWorstUsersScreen.js`](C:\Users\jtruu\epsu\OwnerWorstUsersScreen.js):

- Calls `fetchWorstUsers`
- Labels users as generic `User 1`, `User 2`, etc.
- Ranks by count of posts with `status = deleted_by_mod`

### 7.7 Delete flow

[`DeleteEpsuScreen.js`](C:\Users\jtruu\epsu\DeleteEpsuScreen.js):

- Requires exact typing of the Epsu name before delete button becomes active.
- Calls `onDeleteEpsu`.
- On success navigates to `HomeMain`.

### 7.8 Settings

[`SettingsScreen.js`](C:\Users\jtruu\epsu\SettingsScreen.js) multiplexes three modes:

- main settings
- change password
- delete account

Interesting details:

- Notification toggle in root state is not persisted to database when the user taps the row. The settings row only opens OS settings.
- The main settings screen shows hard-coded subscription data:
  - `Current plan = Annual`
  - `Renewal date = April 2, 2027`
- "Cancel / renew" is a placeholder alert.
- "Delete account" is a UI shell over a root handler that explicitly says secure backend deletion is not implemented.
- A random food is displayed as a non-functional easter egg.

### 7.9 Rent screen

[`RentEpsuScreen.js`](C:\Users\jtruu\epsu\RentEpsuScreen.js) is effectively a stub. The product language strongly implies a future rentable / owner-operated Epsu marketplace, but the flow is not implemented.

## 8. Backend and Domain API Mechanics

All application data operations live in [`lib/epsuApi.js`](C:\Users\jtruu\epsu\lib\epsuApi.js).

### 8.1 Supabase client configuration

[`lib/supabase.js`](C:\Users\jtruu\epsu\lib\supabase.js):

- Reads:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Creates a client only if both are present.
- Auth config:
  - `storage: AsyncStorage`
  - `persistSession: true`
  - `autoRefreshToken: true`
  - `detectSessionInUrl: false`

That means sessions persist locally on-device and token refresh is automatic.

### 8.2 Static Epsu synchronization

`syncStaticEpsus()`:

- Hard-codes a list of 10 city Epsus in client code.
- Upserts them into the `epsus` table on every authenticated boot.
- Uses `onConflict: 'slug'`.

Operationally this is a seed mechanism embedded in the app. It is not environment-agnostic and not admin-triggered; every client session can cause seed synchronization.

### 8.3 Prototype role injection

`ensurePrototypeRoles(profileId)`:

- Hard-codes ownership for:
  - `phoenix-epsu`
  - `nyc-epsu`
- Hard-codes moderator access for:
  - `fort-lauderdale-epsu`
  - `seattle-epsu`
- Upserts those memberships for the current user every time they hydrate.

This is prototype scaffolding, not production access control.

### 8.4 Epsu retrieval and membership retrieval

Functions:

- `fetchEpsus()`
- `fetchUserMemberships(userId)`
- `fetchModeratedEpsuIds(userId)`
- `fetchOwnedEpsuIds(userId)`
- `fetchEpsuMemberships(epsuId)`

Patterns:

- Direct Supabase table queries
- No caching
- No cursor-based pagination
- Explicit status filtering for `left`
- Role and status derived entirely from DB rows

### 8.5 Invite subsystem

`ensureInvite({ epsuId, createdByProfileId, inviteRole })`:

- Looks for an active invite created by the current owner for the given role.
- Reuses it if `use_count < max_uses`.
- Otherwise generates a new 32-char token from an alphanumeric alphabet using `Math.random()`.
- Creates a one-use invite by default.

`redeemInvite({ token, profileId })`:

- Validates invite existence and remaining uses.
- Translates invite role into membership tuple:
  - moderator invite -> role `moderator`, status `active`
  - member invite -> role `member`, status `invited`
- Upserts membership on `(epsu_id, profile_id)`.
- Increments `use_count`.
- Deactivates invite when exhausted.

The invite token generator is not cryptographically strong because it uses `Math.random()`. For a real access token system, that is a security weakness.

### 8.6 Post retrieval and creation

`fetchPosts()`:

- Returns only `status = active` posts.
- Orders by `number ASC`.

`createPost({ epsuId, title, body, userId, replyToPostId })`:

- Fetches latest post number for an Epsu.
- Computes `nextNumber = latest + 1`.
- Inserts the post.

This is not serialized and is vulnerable to race conditions under concurrent posting. Two clients can read the same latest number and contend on the `(epsu_id, number)` unique constraint.

### 8.7 Reaction subsystem

`reactToPost({ postId, userId, reaction })`:

- Inserts into `post_reactions`
- Handles duplicate reaction attempts through unique violation `23505`
- Reads current post counts
- Computes new totals client-side
- If total reactions >= 100 and dislikes / total >= 0.6:
  - updates post status to `deleted_by_threshold`
- Else:
  - updates counts only

This is also concurrency-sensitive. Count accumulation is performed in multiple client-driven statements instead of a single transactional server-side mutation.

### 8.8 Reporting subsystem

`reportPost({ postId, userId, reason, explanation })`:

- Concatenates reason and explanation into one text field
- Inserts into `post_reports`
- Treats duplicate report attempts by the same user as a handled duplicate via unique index

### 8.9 Moderation action logging

`logModerationAction(...)` inserts into `moderation_actions`.

Actions logged:

- `dismiss_report`
- `mute_author_24h`
- `remove_post`

This table drives moderator statistics.

### 8.10 Moderator actions

`dismissReport(postId, actorProfileId, epsuId, targetProfileId)`:

- Marks all open reports on that post as `rejected`
- Logs action

`removeReportedPost(postId, actorProfileId, epsuId, targetProfileId)`:

- Marks post as `deleted_by_mod`
- Marks open reports as `resolved`
- Logs action

`muteReportedAuthor(profileId, epsuId, postId, actorProfileId)`:

- Sets membership status to `muted`
- Marks reports as `resolved`
- Logs action
- Returns `muteUntil`, but the database does not actually persist an expiry timestamp

This is a significant inconsistency: the system says "mute 24h", but the schema only stores `status = muted` with no `muted_until` column or scheduler/unmute worker.

### 8.11 Ownership and membership mutations

`updateMembershipRole(membershipId, role)`:

- direct update on `epsu_memberships.role`

`updateMembershipStatus(membershipId, status)`:

- direct update on `epsu_memberships.status`

`deleteEpsu(epsuId)`:

- hard-deletes the Epsu row
- cascades dependent rows because of FK definitions

## 9. Database Design

### 9.1 Schema objects

Core schema in [`supabase/schema.sql`](C:\Users\jtruu\epsu\supabase\schema.sql):

- `profiles`
- `epsus`
- `epsu_memberships`
- `posts`
- `post_reactions`
- `post_reports`
- `epsu_subscriptions`
- trigger function `set_updated_at()`

Additional migrations:

- [`2026-03-29-epsu-invites.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-epsu-invites.sql)
- [`2026-03-29-moderation-actions.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-moderation-actions.sql)
- [`2026-03-29-report-uniqueness.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-report-uniqueness.sql)

### 9.2 Table-by-table analysis

#### `profiles`

Purpose:

- App-specific extension table for authenticated users

Columns:

- `id uuid primary key references auth.users`
- `username text unique`
- `notifications_enabled boolean`
- `created_at`
- `updated_at`

Notes:

- App code manually inserts/upserts profile rows after signup.
- There is no DB trigger here linking `auth.users` signup to automatic profile creation.

#### `epsus`

Purpose:

- Master table for communities

Columns:

- `id`
- `slug unique`
- `name`
- `code` with length check 1..3
- `scope` in `city | state | country | private`
- `membership_cap`
- `owner_id`
- `is_rentable`
- `annual_price_usd`
- timestamps

Notes:

- Several monetization-oriented columns exist but are largely unused in client logic.
- `owner_id` is not the authority source in the app. Ownership is actually derived from `epsu_memberships.role = owner`.

#### `epsu_memberships`

Purpose:

- Join table between users and Epsus

Columns:

- `epsu_id`
- `profile_id`
- `role` in `member | owner | moderator`
- `status` in `active | muted | left | invited`
- timestamps
- uniqueness on `(epsu_id, profile_id)`

Notes:

- This table carries both authorization role and lifecycle state.
- There is no expiry field for temporary mute.

#### `posts`

Purpose:

- Anonymous post record within an Epsu

Columns:

- `epsu_id`
- `author_id`
- `number` unique within Epsu
- `title`
- `body`
- `reply_to_post_id`
- `like_count`
- `dislike_count`
- `status` in `active | deleted_by_threshold | deleted_by_mod`
- timestamps

Notes:

- `author_id` is stored, so anonymity is social/UI anonymity, not database anonymity.
- Replies are supported by self-reference but only minimally surfaced in UI.

#### `post_reactions`

Purpose:

- One reaction per user per post

Columns:

- `post_id`
- `profile_id`
- `reaction` in `like | dislike`
- unique `(post_id, profile_id)`

Notes:

- There is no ability to change or remove a reaction.

#### `post_reports`

Purpose:

- Abuse / moderation signal

Columns:

- `post_id`
- `profile_id`
- `reason`
- `status` in `open | resolved | rejected`
- timestamp

Notes:

- Unique index later added on `(post_id, profile_id)` to prevent duplicate reporting by the same user.
- Category and narrative explanation are denormalized into one text column.

#### `epsu_subscriptions`

Purpose:

- Placeholder subscription / billing table

Columns:

- `provider` in `manual | stripe | apple | google | paypal | paddle`
- `external_subscription_id`
- `plan_name`
- `status` in `active | canceled | past_due | expired`
- `renewal_at`

Notes:

- No active client flows write or read this table.
- UI subscription fields are currently placeholders, not tied to this table.

#### `epsu_invites`

Purpose:

- One-time invite token issuance

Columns:

- `epsu_id`
- `created_by_profile_id`
- `invite_role`
- `token unique`
- `max_uses`
- `use_count`
- `is_active`
- `created_at`

Index:

- `(epsu_id, invite_role, is_active)`

#### `moderation_actions`

Purpose:

- Audit-ish event log for owner moderation oversight

Columns:

- `actor_profile_id`
- `target_profile_id`
- `epsu_id`
- `post_id`
- `action_type`
- `created_at`

### 9.3 Missing database features

Not present in checked-in SQL:

- RLS policies
- DB functions for privileged actions
- transactional stored procedures for posting or reaction counting
- indexes for all common query paths
- materialized views for analytics
- background jobs
- scheduled unmute logic
- soft-delete support for Epsus

## 10. Security Model and Trust Boundary Assessment

The visible trust model is weak for a production social product.

### 10.1 Client-side privileged operations

The client performs or can perform:

- role changes
- status changes
- invite creation
- report resolution
- post deletion by moderator status
- Epsu deletion

Without enforced DB-side policies, the client becomes the policy engine, which is not sufficient.

### 10.2 Anon key direct access

The app ships an Expo public environment variable containing the Supabase publishable key in [`eas.json`](C:\Users\jtruu\epsu\eas.json). That is normal for public clients, but it increases the importance of RLS and server-side authorization. Since those policy definitions are not in repo, the implementation cannot be considered secure from the repository alone.

### 10.3 Invite token quality

Invite tokens are generated with `Math.random()`, not a cryptographic RNG. That is unsuitable for a hardened invitation/access boundary.

### 10.4 Account deletion

The UI exposes delete-account navigation, but the app explicitly refuses execution because a secure backend function does not exist. That is good honesty in UX, but it also confirms that the project lacks a privileged service tier for destructive account-level actions.

## 11. Product Semantics and Actual Behavior

### 11.1 "Anonymous" is UI anonymity

Users do not see usernames on posts in the main feed, but the database stores `author_id`. Moderators reviewing reports can access `author_id` through report payloads. Owners also obtain membership identities through `profiles(username)` joins. So anonymity is product-facing, not infrastructural.

### 11.2 Membership semantics

Membership states behave as:

- `active`: full participation
- `invited`: pending owner approval
- `muted`: participation blocked in theory
- `left`: excluded from active membership fetches

But the app does not fully enforce muted status at post-creation time in client code. `handleSubmitPost` does not check membership status before posting; it delegates directly to `createPost`.

### 11.3 Moderation threshold semantics

Automatic deletion rule:

- At least 100 total reactions
- At least 60% dislike ratio

This is an application-level crowd moderation threshold. The rule is simple and deterministic, but because it is calculated in client-orchestrated writes, concurrent correctness is not guaranteed.

### 11.4 Ownership model

Ownership is dual-mode in schema and logic:

- Schema has `epsus.owner_id`
- Runtime logic uses `epsu_memberships.role = owner`

That duplication can drift unless synchronized, and current code only relies on memberships.

## 12. Public Site and Invite Web Mechanics

The public web surface under [`site/`](C:\Users\jtruu\epsu\site) is intentionally minimal.

### 12.1 Pages

Pages present:

- `/` via [`site/index.html`](C:\Users\jtruu\epsu\site\index.html)
- `/terms`
- `/guidelines`
- `/privacy`
- `/join.html`
- `/mod.html`

### 12.2 Landing page layout

[`site/index.html`](C:\Users\jtruu\epsu\site\index.html) contains:

- Hero block
  - eyebrow: "Local communities"
  - title: "Epsu"
  - lede describing anonymous, moderated, privately owned local communities
- Card grid
  - Terms of service
  - Community guidelines
  - Data use and privacy

There is no nav bar, no footer, no login, no app download CTA, no dashboard, and no dynamic content. The site is document-centric.

### 12.3 Invite pages

[`site/join.html`](C:\Users\jtruu\epsu\site\join.html) and [`site/mod.html`](C:\Users\jtruu\epsu\site\mod.html):

- Render a header and a card-like section.
- Echo the full current URL into the page via:
  - `document.getElementById('invite-link').textContent = window.location.href`
- Instruct the user to open the app and paste the full link into the Home invite flow.

These pages do not actually redeem tokens server-side. They are passive wrappers around a URL copy/paste pattern.

### 12.4 Styling system

[`site/styles.css`](C:\Users\jtruu\epsu\site\styles.css) defines:

- Pink-to-light gradient page background
- `Trebuchet MS` / `Segoe UI` font stack
- card grid layout
- document page shell
- hover lift effect on cards

The web design language matches the mobile palette closely:

- primary pink / red accents
- soft pink borders
- white cards
- rounded corners

## 13. Deployment and Release Mechanics

### 13.1 Expo config

[`app.json`](C:\Users\jtruu\epsu\app.json):

- app name and slug: `epsu`
- package id on Android: `com.jtruu.epsu`
- app scheme: `epsu`
- portrait orientation
- new architecture enabled
- React Compiler experimental flag enabled
- EAS project ID configured

### 13.2 EAS build config

[`eas.json`](C:\Users\jtruu\epsu\eas.json):

- CLI version gate: `>= 16.13.0`
- build profiles:
  - `development`
  - `demo`
- both profiles:
  - inject public Supabase URL and anon key
  - build Android APK
- `development` uses `developmentClient: true`

Implications:

- The project is currently optimized for internal builds more than public store release.
- No production build profile is defined.
- No iOS distribution profile is defined here.

### 13.3 Static site deploy

[`site/render.yaml`](C:\Users\jtruu\epsu\site\render.yaml) defines a Render static service:

- service type `web`
- runtime `static`
- publish path `.`

[`site/README.md`](C:\Users\jtruu\epsu\site\README.md) says the publish directory should be `site`. That is slightly inconsistent with `render.yaml` living inside `site/` and using `.` as publish path. Practically, if the Render root is set to the `site` directory, `.` is correct.

### 13.4 Domain model

[`DOMAIN_SETUP.md`](C:\Users\jtruu\epsu\DOMAIN_SETUP.md) declares:

- `https://epsu.site` as canonical public base
- legal doc URLs
- intent for join/mod invite URLs
- Supabase Auth Site URL should be `https://epsu.site`

This indicates the product expects one branded domain shared by both public docs and invite landings.

## 14. Cost Model

This section separates repository-observable costs from inferred operational cost classes. Exact billing depends on current provider plans and traffic. Prices below were checked against official provider pages available on March 30, 2026.

### 14.1 Direct infrastructure categories in this repo

Actual services visible in code/config:

- Supabase project
- Expo Application Services / EAS
- Render static hosting

Potential future categories implied by schema or UX:

- payment processor for Epsu rentals/subscriptions
- app store developer accounts
- transactional email / custom SMTP for auth and onboarding
- monitoring / logging
- analytics

### 14.2 Supabase cost surface

Visible usage drivers from this app:

- Auth monthly active users
- Postgres storage
- Postgres compute
- egress from API traffic
- potential email auth overhead

Current official Supabase billing docs indicate:

- Free plan allows 2 free projects.
- Paid organizations add compute cost per project.
- Free includes 50,000 monthly active users and 500 MB database size per project.
- Pro/Team include 100,000 monthly active users, 250 GB egress, and 100 GB storage quota at organization level, with overage charges after quota.
- Example overage figures currently documented include:
  - egress: $0.09/GB
  - storage: $0.021/GB-month
  - edge function invocations: $2 per million beyond quota
  - realtime messages: $2.50 per million beyond quota

For this app as currently implemented:

- Realtime costs are likely zero because Realtime is not used.
- Storage bucket costs are likely zero because no file uploads exist.
- Edge Function costs are zero because no edge functions are present.
- Core paid pressure would come first from compute, MAU growth, and database size.

Official sources:

- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/storage/management/pricing
- https://supabase.com/docs/guides/functions/pricing
- https://supabase.com/docs/guides/realtime/pricing

### 14.3 Expo / EAS cost surface

Current official Expo pricing indicates:

- Free: $0/month, up to 15 Android and 15 iOS builds, low-priority queue, updates to 1K MAUs
- Starter: $19/month with $45 build credit
- Production: $199/month with $225 build credit and more concurrency

For this repo specifically:

- EAS is used for internal/demo Android APK builds.
- There is no production profile committed, so current cost need may remain near-free for small internal use.
- Once frequent CI builds, store submissions, or meaningful OTA update traffic begins, EAS becomes a real operating cost.

Official sources:

- https://expo.dev/pricing
- https://docs.expo.dev/billing/plans/
- https://docs.expo.dev/billing/usage-based-pricing/

### 14.4 Render static site cost surface

Render docs currently state static sites are fast and free to deploy, but they count against workspace monthly included outbound bandwidth and pipeline minutes.

For this repo:

- The public/legal site cost is likely minimal.
- The site is static HTML/CSS with tiny inline JS only.
- Main scaling cost would come from bandwidth, not compute, because there is no dynamic server.

Official sources:

- https://render.com/docs/static-sites
- https://render.com/pricing

### 14.5 Hidden non-infra cost centers

Once this app becomes real, the dominant costs may shift from infrastructure to operations:

- content moderation labor
- abuse response
- legal/privacy compliance
- app store distribution and review delays
- incident response
- support load
- payment chargebacks if rentable Epsus become real

### 14.6 Cost profile by maturity stage

Prototype:

- Supabase Free
- Expo Free
- Render free static site
- near-zero infra spend

Closed beta:

- Expo Starter likely justified for faster build throughput
- Supabase may still be free unless MAU or data grows
- moderation labor begins to dominate

Public launch:

- Supabase Pro or higher likely required for predictability
- Expo paid plan likely required for release operations
- possible payment provider fees if rentals/subscriptions activate
- possible third-party observability spend

## 15. Operational Characteristics

### 15.1 Scalability profile

Strengths:

- Simple direct architecture
- Few moving parts
- Static site almost costless
- Supabase reduces backend ops burden

Weaknesses:

- Root component eager-loads large datasets
- No pagination
- No feed slicing
- repeated client-side filtering over arrays
- several workflows use N+1-style queries from the app after auth hydration
- no background processing

### 15.2 Consistency profile

Known consistency risks:

- post numbering race
- reaction count race
- multiple sequential write operations without transaction boundary
- optimistic state updates without full reconciliation
- temporary mute not actually temporary

### 15.3 Observability

There is no evidence in repo of:

- analytics instrumentation
- crash reporting
- tracing
- structured logging
- server audit dashboards
- alerting

The only audit-like persistence is `moderation_actions`.

## 16. Notable Gaps and Risks

### 16.1 Missing authorization definitions

The largest risk is that the repository does not define the authorization model in SQL. If RLS exists only in the hosted Supabase console and not in version control, then the repo is incomplete as an auditable system definition.

### 16.2 Root-level prototype shortcuts

`ensurePrototypeRoles()` and `syncStaticEpsus()` mean every authenticated session performs environment-shaping writes. That is acceptable for prototype demos and unacceptable for a real multitenant product.

### 16.3 Placeholder subscription/rental system

The schema and UI hint at:

- rentable Epsus
- annual pricing
- subscription providers

But no full payment stack exists in the code. Settings even shows static plan metadata unrelated to actual billing records.

### 16.4 Account lifecycle incompleteness

- account deletion not implemented
- notification preference not persisted on toggle
- no password reset flow in app
- no email verification UX beyond sign-up error message

### 16.5 Data model drifts

Examples:

- `owner_id` exists on `epsus`, but runtime ownership uses memberships
- `muteUntil` returned by API is not stored
- `epsu_subscriptions` exists but is unused
- invite URLs in docs mention path-based formats, while actual app generates query-string links to `join.html` and `mod.html`

## 17. Full End-to-End Flow Summary

### 17.1 Account creation

1. User signs up in app.
2. Supabase Auth creates auth user.
3. App upserts `profiles` row.
4. If email verification prevents immediate session issuance, the app shows a verify-email message.

### 17.2 Login and hydration

1. User logs in with email/password.
2. App gets session.
3. App loads profile.
4. App syncs static Epsus.
5. App injects prototype memberships.
6. App loads Epsus, posts, reactions, reports, memberships, moderation scope.
7. App renders tabs.

### 17.3 Reading feed

1. User enters Home.
2. User sees accessible Epsus plus synthetic "Rent a new Epsu".
3. User selects an Epsu.
4. App shows first post not already reacted to by the user.
5. User double-taps left/right hit zone to dislike/like.
6. App records reaction and updates counts.
7. If threshold reached, post disappears because status changes to deleted.

### 17.4 Posting

1. User goes to Post tab.
2. User searches for an Epsu.
3. User selects Epsu.
4. User enters title and body.
5. App computes next post number and inserts row.
6. App returns to Home for that Epsu.

### 17.5 Reporting and moderation

1. User reports a post.
2. App inserts `post_reports` row.
3. Moderator enters Mod Queue.
4. Queue groups reports by post.
5. Moderator opens investigation.
6. Moderator dismisses, removes, or mutes.
7. App updates report/post/membership rows.
8. App logs moderation action.

### 17.6 Membership and invites

1. Owner generates one-time invite.
2. App stores invite token in `epsu_invites`.
3. Owner shares query-string invite URL or QR.
4. Recipient pastes link/code into Join Invite screen.
5. App redeems token.
6. Membership becomes:
   - `invited` for member links
   - `active moderator` for mod links
7. Owner approves invited members in Members screen.

## 18. What This App Actually Is Today

In current code, Epsu is:

- a direct-to-Supabase mobile prototype
- with a polished but compact React Native UI
- with manual moderation and owner control flows
- with a static document site
- with early monetization concepts in schema and copy
- but without a hardened backend policy layer, a real billing system, or a fully completed lifecycle implementation

It is not yet:

- a zero-trust production social platform
- a complete subscription app
- a fully normalized/admin-safe moderation system
- a backend-service-oriented architecture

## 19. Recommended Next Technical Evolutions

If this were to be productionized, the highest-leverage next steps would be:

1. Move all privileged mutations into server-side functions or SQL RPC with explicit authorization checks.
2. Check in full Supabase RLS policies and grants.
3. Replace client-generated post numbering and reaction accumulation with transactional database logic.
4. Add a real temporary mute model with `muted_until`.
5. Normalize reports into category + explanation columns.
6. Remove prototype role injection from app boot.
7. Implement real billing or remove placeholder billing UX.
8. Add observability, crash reporting, and abuse analytics.
9. Define a real production build profile in `eas.json`.
10. Decide whether `owner_id` or membership role is the canonical source of ownership and delete the other or maintain it by trigger.

## 20. Source Index

Primary repository sources:

- [`app.js`](C:\Users\jtruu\epsu\app.js)
- [`lib/supabase.js`](C:\Users\jtruu\epsu\lib\supabase.js)
- [`lib/epsuApi.js`](C:\Users\jtruu\epsu\lib\epsuApi.js)
- [`supabase/schema.sql`](C:\Users\jtruu\epsu\supabase\schema.sql)
- [`supabase/migrations_legacy/2026-03-29-epsu-invites.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-epsu-invites.sql)
- [`supabase/migrations_legacy/2026-03-29-moderation-actions.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-moderation-actions.sql)
- [`supabase/migrations_legacy/2026-03-29-report-uniqueness.sql`](C:\Users\jtruu\epsu\supabase\migrations_legacy\2026-03-29-report-uniqueness.sql)
- [`HomeScreen.js`](C:\Users\jtruu\epsu\HomeScreen.js)
- [`PostScreen.js`](C:\Users\jtruu\epsu\PostScreen.js)
- [`ModQueueScreen.js`](C:\Users\jtruu\epsu\ModQueueScreen.js)
- [`OwnerToolsScreen.js`](C:\Users\jtruu\epsu\OwnerToolsScreen.js)
- [`OwnerMembersScreen.js`](C:\Users\jtruu\epsu\OwnerMembersScreen.js)
- [`OwnerTeamScreen.js`](C:\Users\jtruu\epsu\OwnerTeamScreen.js)
- [`OwnerAccessScreen.js`](C:\Users\jtruu\epsu\OwnerAccessScreen.js)
- [`OwnerModInviteScreen.js`](C:\Users\jtruu\epsu\OwnerModInviteScreen.js)
- [`OwnerWorstUsersScreen.js`](C:\Users\jtruu\epsu\OwnerWorstUsersScreen.js)
- [`JoinInviteScreen.js`](C:\Users\jtruu\epsu\JoinInviteScreen.js)
- [`ReportScreen.js`](C:\Users\jtruu\epsu\ReportScreen.js)
- [`DeleteEpsuScreen.js`](C:\Users\jtruu\epsu\DeleteEpsuScreen.js)
- [`SettingsScreen.js`](C:\Users\jtruu\epsu\SettingsScreen.js)
- [`site/index.html`](C:\Users\jtruu\epsu\site\index.html)
- [`site/join.html`](C:\Users\jtruu\epsu\site\join.html)
- [`site/mod.html`](C:\Users\jtruu\epsu\site\mod.html)
- [`site/styles.css`](C:\Users\jtruu\epsu\site\styles.css)
- [`app.json`](C:\Users\jtruu\epsu\app.json)
- [`eas.json`](C:\Users\jtruu\epsu\eas.json)
- [`DOMAIN_SETUP.md`](C:\Users\jtruu\epsu\DOMAIN_SETUP.md)

External pricing sources checked March 30, 2026:

- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/storage/management/pricing
- https://supabase.com/docs/guides/functions/pricing
- https://supabase.com/docs/guides/realtime/pricing
- https://expo.dev/pricing
- https://docs.expo.dev/billing/plans/
- https://docs.expo.dev/billing/usage-based-pricing/
- https://render.com/docs/static-sites
- https://render.com/pricing
