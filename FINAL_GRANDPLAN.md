# Epsu Final Grandplan

## 1. What This Document Is

This document is the biggest current-state explanation of the Epsu repository. It is not a pitch deck. It is not a vague roadmap. It is not a "what might happen" file. It is a present-tense system bible written from the code, the migrations, the public/legal pages, the store-preparation documents, and the repository structure as they exist in this repo on April 20, 2026.

This file is intentionally direct. It explains what Epsu is, how it is built, what the app actually does, what the backend actually enforces, what the public site actually says, what the store drafts currently claim, and where the repo still contains historical or legacy material.

The phrase "grandplan" here means "single exhaustive explanation of the current system," not "promised future blueprint."

## 2. Source Set Used

This document is grounded in these repo sources:

- Application shell and orchestration:
  - `app.js`
  - `index.js`
  - `AppContext.js`
- Primary screens:
  - `LoginScreen.js`
  - `SignUpScreen.js`
  - `ForgotPasswordScreen.js`
  - `ResetPasswordScreen.js`
  - `HomeScreen.js`
  - `PostScreen.js`
  - `ReportScreen.js`
  - `SettingsScreen.js`
  - `SchoolApplicationScreen.js`
  - `RentEpsuScreen.js`
  - `RegionalConfirmationScreen.js`
  - `JoinInviteScreen.js`
  - `DeleteEpsuScreen.js`
  - `ModQueueScreen.js`
  - `ModerationRecordsScreen.js`
  - `OwnerToolsScreen.js`
  - `OwnerMembersScreen.js`
  - `OwnerTeamScreen.js`
  - `OwnerModInviteScreen.js`
  - `OwnerWorstUsersScreen.js`
  - `AdminScreen.js`
- Runtime support and domain code:
  - `lib/useAppBootstrap.js`
  - `lib/createCommunityActions.js`
  - `lib/createAccountActions.js`
  - `lib/appStateTransforms.js`
  - `lib/api/feed.js`
  - `lib/api/epsus.js`
  - `lib/api/moderation.js`
  - `lib/api/account.js`
  - `lib/useAppNotifications.js`
  - `lib/notificationApi.js`
  - `lib/supabase.js`
  - `lib/flaggedPostKeywords.js`
  - `lib/schoolApi.js`
  - `lib/epsuApi.js`
  - `lib/helpResources.js`
  - `lib/networkGuard.js`
- Config and packaging:
  - `package.json`
  - `app.json`
  - `eas.json`
- Supabase bootstrap and migrations:
  - `supabase/schema.sql`
  - `supabase/migrations/*.sql`
  - `supabase/README.md`
  - `supabase/functions/send-push-notifications/index.ts`
- Public and legal site:
  - `site/index.html`
  - `site/terms.html`
  - `site/privacy.html`
  - `site/guidelines.html`
  - `site/delete-account.html`
  - `site/system-report.html`
  - `site/epsu-master-report.html`
  - `site/styles.css`
  - `site/render.yaml`
- Store submission/support docs:
  - `docs/APPLE_APP_PRIVACY_DETAILS.md`
  - `docs/GOOGLE_PLAY_DATA_SAFETY.md`
  - `docs/APP_LISTING_COPY.md`
  - `docs/APPLE_REVIEW_NOTES.md`
  - `docs/GOOGLE_PLAY_REVIEW_NOTES.md`
- Internal long-form documents:
  - `EPSU_MASTERPLAN.md`
  - `TECHNICAL_REPORT.md`
  - `LAUNCH_CHECKLIST.md`
  - `ANALYTICS_PLAN.md`
  - `BUSINESS_TODO.md`
  - `HOST_POLICY_DRAFT.md`

## 3. The Shortest True Description

Epsu is a mobile-first anonymous community app centered on place-based and school-based communities called Epsus.

The core current product model is:

- users create email/password accounts
- users have profile data including username, date of birth, country, and policy acceptance timestamps
- users join or apply to Epsus depending on the community type
- users submit anonymous posts
- posts are not published instantly; they are queued for the next UTC full-hour batch
- each user can submit only one post per Epsu per hourly cycle
- released posts exist for a limited cycle and are then deleted
- once a user reacts to a post, that post disappears from that user's feed
- users can report posts
- users can block anonymous authors from their own feed
- moderators and owners have scoped governance tools
- admins have platform review tools

Epsu is not a direct-messaging app, not a public profile app, and not a classic permanent archive forum. The system is built around anonymous public posting with backend accountability and intentionally short-lived feed content.

## 4. Product Identity

### 4.1 What an Epsu is

An Epsu is a bounded community object. In the current product, the important categories are:

- regional Epsus
- school Epsus

Regional Epsus represent places. School Epsus represent institutions. They do not have identical rules.

### 4.2 What anonymity means here

Normal users do not see author identity on posts. The backend still knows the author. Moderation and safety actions depend on that fact. So the current truthful definition is:

- public anonymity
- backend accountability

That distinction matters across nearly every surface:

- feed rendering
- moderation queue
- reports
- account deletion
- account history export
- block-author handling
- store review explanations
- legal text

### 4.3 What makes Epsu structurally different

The biggest current structural differences from generic social apps are:

- no public author identity in the normal feed
- hourly queued post drops
- short-lived post lifecycle
- place/school bounded communities instead of one global topic graph
- owner/mod/admin governance layers

## 5. Runtime Stack

### 5.1 Mobile stack

The app is an Expo / React Native project with:

- Expo SDK 54
- React 19.1.0
- React Native 0.81.5
- React Navigation 7
- Supabase JS 2.100.1
- AsyncStorage
- Expo Notifications
- Expo Image Picker
- Expo Linking
- Expo Updates

Key dependency classes from `package.json`:

- navigation:
  - `@react-navigation/native`
  - `@react-navigation/native-stack`
  - `@react-navigation/bottom-tabs`
- backend:
  - `@supabase/supabase-js`
- device persistence:
  - `@react-native-async-storage/async-storage`
- permissions and device APIs:
  - `expo-notifications`
  - `expo-image-picker`
  - `expo-network`
  - `expo-file-system`
  - `expo-sharing`
- visuals:
  - `expo-image`
  - `react-native-qrcode-svg`
  - `expo-splash-screen`
  - `@expo/vector-icons`

### 5.2 Backend stack

The backend is Supabase:

- Auth
- Postgres
- Storage
- RPCs
- RLS-backed access design
- an Edge Function for push delivery

There is no separate Express server, Rails app, or custom API server in this repo. The app talks to Supabase and relies on the database layer for increasingly large parts of the real authority model.

### 5.3 Public site stack

The public site under `site/` is static HTML and CSS. It is not a framework app. It is configured for Render static hosting through `site/render.yaml`.

## 6. Application Packaging and Identity

`app.json` currently defines:

- app name: `epsu`
- slug: `epsu`
- scheme: `epsu`
- bundle/package:
  - iOS: `com.jtruu.epsu`
  - Android: `com.jtruu.epsu`
- runtimeVersion policy: `appVersion`
- Expo Updates URL configured

Permissions and usage strings currently declared:

- iOS notifications usage description
- iOS photo library usage description
- `expo-image-picker` plugin with matching photo permission language
- `expo-notifications` plugin with default notification channel settings

Branding assets currently include:

- `assets/images/1000133096.png`
- `assets/images/cat-app-icon.png`
- Android foreground/background/monochrome icon assets

## 7. Navigation and Top-Level App Shape

The app is built around an auth split and tab navigation.

### 7.1 Unauthenticated side

Users who are not authenticated see the auth flow:

- login
- sign up
- forgot password / reset password related flow

### 7.2 Authenticated side

Once authenticated, the app uses a tab layout with:

- Post
- Home
- Settings

This means the app is organized around three constant pillars:

- create content
- consume and govern content
- manage self and account

### 7.3 Home-side stacks and deeper screens

The Home side branches into the core operational product:

- feed view
- reporting
- moderation queue
- owner tools
- moderator invite handling
- school application review
- membership management
- deletion of an Epsu
- invitation-related and regional/community confirmation flows

### 7.4 Settings-side stacks

The Settings side houses:

- policy/help links
- password change
- account deletion
- account-related informational surfaces

## 8. Boot Model

The app boot logic lives mainly in `lib/useAppBootstrap.js` and is orchestrated from `app.js`.

The current boot model does these jobs:

- loads and restores the Supabase auth session
- fetches profile information
- resolves whether the user is signed in
- restores or applies cached app data
- fetches core backend data
- tracks a boot message for the startup/loading screen
- keeps bootstrap state and app state aligned

The app no longer behaves like a pure blank boot with no UX. There is a branded loading state with user-facing messaging.

The boot system also now logs timing around key account checks, which has already been used to diagnose delays in:

- `auth.getSession`
- profile selection
- profile repair upsert behavior

## 9. Local State and Local Storage

Epsu is cloud-backed, but it is not "cloud only." It deliberately stores data locally for persistence and speed.

### 9.1 Authoritative cloud data

Supabase is the authoritative source for:

- profiles
- Epsus
- memberships
- posts
- reactions
- reports
- moderation actions
- school applications
- notifications
- push tokens
- invite records
- suggestion records
- account history data
- block-author relationships

### 9.2 Local device persistence

The app also persists local data in AsyncStorage and in-memory state, including:

- auth session
- bootstrap cache
- post draft
- notification soft-prompt state
- last push token
- pending moderator invite token
- current runtime copies of posts, memberships, reports, and block lists

### 9.3 Why that matters

The truthful statement is:

- Supabase is the source of truth
- the phone still becomes a mini cache/database for UX and boot performance

That is normal for modern cloud-first apps.

## 10. Current Major Product Systems

### 10.1 Accounts

The account model is email/password based. The signup flow collects:

- username
- email
- password
- date of birth
- country
- acceptance of Terms and Privacy

The account layer also supports:

- password reset
- account deletion
- policy acceptance tracking
- notification preference tracking

### 10.2 Communities

Communities are the center of the product. The app is not "global feed first." It is "community access first."

The app currently supports:

- regional community visibility by country
- school community visibility by country
- school application workflows
- region suggestion workflows
- membership role and status management
- owned and moderated scope views

### 10.3 Anonymous posts

The app's central content primitive is the anonymous post. Posts can be:

- top-level
- replies

Posts are now governed by a queued lifecycle instead of immediate publication.

### 10.4 Reports and moderation

Users report posts. Moderators and owners process reports through dedicated screens and actions. Moderation creates action records.

### 10.5 Short-lived content

The app now officially behaves as a temporary-content product rather than a permanent feed archive.

## 11. Current Post Lifecycle

This is one of the biggest system truths in the current app.

### 11.1 Submission timing

Posts do not publish instantly.

When a user submits a post:

- it is queued
- the backend computes the next UTC full hour
- the post belongs to that next release batch

The bucket rule currently confirmed for the system is:

- `11:00:00.000` to `11:59:59.999` UTC releases at `12:00:00` UTC
- `12:00:00.000` UTC belongs to the `13:00:00` UTC batch

### 11.2 Per-cycle limit

Each user can submit:

- one post per Epsu per hourly cycle

That rule is backend-enforced.

### 11.3 Release

Queued posts become active at their assigned release time.

Within a batch, ordering is chronological by submission order. The intended feeling is closer to confession-page drop order than algorithmic ranking.

### 11.4 Visibility

Normal feed queries show active released posts, not queued ones.

Users can reply only to released posts.

### 11.5 Reaction-based disappearance

Once a user reacts to a post:

- that user no longer sees it in the feed

This is part of the core consumption design, not a side effect.

### 11.6 Expiry and deletion

Posts are short-lived. The system is designed to remove them after their lifecycle ends. The product and public docs now explicitly present Epsu as non-archival and temporary.

### 11.7 Moderation before release

Keyword-flagged queued posts can enter a mod-review path before they become public. This is a major shift from a purely reactionary moderation model.

## 12. Current Auto-Delete Threshold Logic

The system no longer uses the old flat "100 reactions and 60% dislikes" rule.

It now uses a progressive turnout-based formula:

`y = 0.80 + (0.51 - 0.80) * ((p - 0.10) / 0.90)`

Where:

- `p` is participation rate relative to active or muted members in the Epsu
- `y` is required dislike ratio

Meaning:

- lower participation requires stronger dislike consensus
- higher participation relaxes toward a simple-majority style threshold

This logic lives in the SQL migration layer and is part of the current backend policy model.

## 13. Membership Model

Membership is not a single boolean. It has both status and role dimensions.

### 13.1 Important role types

Current role types in the system include:

- member
- moderator
- owner
- platform admin as a profile-level flag rather than an Epsu role

### 13.2 Important status types

The broader system uses statuses such as:

- active
- pending / invited / applied states in the relevant flows
- muted
- kicked or rejected outcomes where appropriate

### 13.3 Current hard limits

The backend now enforces:

- maximum `1` regional Epsu membership
- maximum `3` school Epsu memberships

There is no owner or moderator exception to that rule.

### 13.4 Visibility versus access

The current country model distinguishes between:

- what users can see in the Epsu list
- what users can actually join or access

A user can see same-country relevant Epsus without necessarily having feed access to them.

## 14. Regional Epsus

Regional Epsus are geographically bounded communities.

Current truths:

- visibility is country-scoped in the app
- membership is limited to one regional Epsu at a time
- large regional strategies are not solved by the code itself; they are product/governance choices
- suggestion and approval machinery exists for regional demand

The repo also contains region-suggestion review logic in the migration history and admin surfaces.

## 15. School Epsus

School Epsus are more controlled than regional Epsus.

Current truths:

- school Epsus require creation data such as name, website, country, and logo
- school creation and review flows exist
- creators/owners receive scoped management power
- users apply to school Epsus
- owners review applications
- hard cap is three school memberships

This is one of the most operationally dense parts of the product, because it intersects:

- storage
- moderation
- membership
- admin review
- logo upload policies

## 16. Invite Systems

The product contains at least two meaningful invite patterns:

- member access invites
- moderator invites

The moderator invite flow was recently completed end to end so that:

- a QR code or deep link can be created
- the app can accept `mod-invite` deep links
- logged-out users can carry the pending token locally until auth completes
- successful redemption refreshes scope and confirms the user is now a moderator in the specific Epsu

This is important because the repo previously contained only partial invite behavior.

## 17. Moderation System

### 17.1 User-side reporting

Users can report posts in-app. That is a major safety primitive and is already reflected in:

- code
- public guidelines
- reviewer notes
- legal text

### 17.2 Moderator tools

The moderator and owner toolset currently includes:

- viewing reports
- resolving reports
- removing posts
- muting users
- team management
- reviewing membership or application issues
- moderator invite creation
- moderation records and "worst users" style views

### 17.3 Queued flagged post review

The system now also includes a second safety path:

- queued keyword-flagged posts

These can be available privately for moderator review before release.

### 17.4 Block author

One of the latest additions is user-controlled blocking of anonymous authors.

Current state:

- `Block author` sits in the same action row as `Reply` and `Report`
- it uses the same visual style as those controls
- it opens a confirmation dialog
- it stores a backend block relationship without revealing identity
- blocked authors' future posts and replies are hidden from that user's feed

This feature exists both in app code and live Supabase state through the `profile_blocks` table and related functions.

## 18. Notifications

Notifications exist in two layers:

- in-app notification records
- push delivery infrastructure

The app supports optional push notifications. Notification permission is not required for basic use.

Push token handling exists in both client and backend logic:

- client-side registration and caching
- backend storage of tokens
- edge-function delivery path

The push-delivery side is intentionally separated from generic client power. The codebase has already moved away from the idea that arbitrary clients should be able to trigger global push sending.

## 19. Permissions

The current app requests or may request:

- notifications
- photo library access for school logo upload

It does not currently request:

- location
- camera
- contacts
- microphone

This matches the current public/store docs drafted in the repo.

## 20. Device and Offline Behavior

The app contains:

- local boot cache
- network-aware startup handling
- offline screen behavior

The fake reconnect button was removed earlier because it created the appearance of functionality without a real action path.

The app startup path was also tightened so that:

- it no longer acts like a blank dead screen
- it uses a branded loading experience
- it no longer waits on an artificial 10-second hold

## 21. Public Site

The public site currently serves several roles:

- landing page
- legal policy hosting
- deletion instructions
- report-style material

### 21.1 Main entry

`site/index.html` presents Epsu as:

- local communities
- place-based anonymous communities
- rating and moderation supported
- privately owned or managed tools included

### 21.2 Legal pages

The repo now contains completed public pages for:

- Terms of Service
- Privacy Policy
- Community Guidelines
- Account and Data Deletion

These replaced the earlier placeholder legal text problem.

### 21.3 Reports

The site also contains:

- `system-report.html`
- `epsu-master-report.html`
- `mod.html`
- `join.html`

These are not all equally central to launch, but they are part of the public-facing document surface.

## 22. Official Public Claims Now Made by the Repo

The repo currently claims, publicly or in store-draft form, that:

- Epsu is anonymous to ordinary users
- users do not see author identities
- users can report posts
- users can block anonymous authors
- the app uses hourly batch post releases
- content is temporary and deleted on cycle expiry
- users can delete their accounts
- notifications and photo library access are optional
- Supabase, Expo, and Render are service providers involved in operating the system

Those claims are now aligned much more closely to the actual code than they were earlier.

## 23. Terms of Service Truths

The Terms page currently states these key operational realities:

- minimum age of 13, with higher local legal minimum if applicable
- account responsibilities and collected signup fields
- Epsu hosts local and school communities
- posts are anonymous, hourly-batched, and temporary
- moderation includes:
  - user reports
  - moderator/admin review
  - reaction-based removal
  - keyword-based safety review
  - blocking anonymous authors
- account deletion is available but blocked while managing an Epsu
- the product is still described there as beta

That last point means the public legal text still contains beta wording even though the visible in-app beta badge has been removed.

## 24. Privacy Policy Truths

The Privacy page currently states these key data truths:

- collection of account data, community data, content/safety data, and support/account data
- local device storage of session, caches, drafts, push token, notification flag, and pending invite token
- use of data for account operation, queue/release logic, moderation, notifications, and account tools
- service-provider usage:
  - Supabase
  - Expo
  - Render
- keyword screening and moderation queue use
- temporary retention model for posts
- in-app account deletion
- de-linking of still-live posts on account deletion until their deletion cycle ends

This is one of the most important texts because it now directly reflects the temporary-content model.

## 25. Community Guidelines Truths

The Community Guidelines page currently states:

- no harassment
- no hate or dehumanization
- no sexual exploitation or child abuse content
- no doxxing
- no scams, spam, or impersonation
- no illegal content or criminal coordination
- no abuse that makes the Epsu hard to use
- users can report posts
- moderators can review queued flagged posts and released posts
- users can block anonymous authors
- available consequences include pre-release removal, released-post removal, 24-hour mute, application rejection, and access restriction

## 26. Account Deletion Truths

The deletion page currently states:

- deletion path exists in Settings
- password confirmation is required
- external deletion requests can be emailed if app access is unavailable
- deletion removes the auth account and many profile-linked records
- submitted posts are not instantly cascaded away if still live; their author link is removed and the post survives only until normal cycle deletion
- deletion is blocked while the user still manages an Epsu

This is an important example of the docs now matching actual code behavior rather than generic wording.

## 27. Store Submission Draft Truths

The repo now includes specific draft text for:

- Apple app privacy details
- Google Play Data Safety
- app listing copy
- Apple review notes
- Google review notes

### 27.1 Apple draft currently claims

- data categories collected
- no analytics SDK
- no ad SDK
- no location/camera/microphone/contacts access
- optional notifications
- optional photo library access

### 27.2 Google draft currently claims

- collected data categories
- no third-party sharing for others' purposes
- service providers on behalf of the developer
- account deletion support
- reporting and blocking support

### 27.3 Listing copy currently claims

- anonymous local and school communities
- hourly post drops
- short-lived feed cycles
- reports and moderation tools
- school applications and owner/moderator tools
- optional push notifications

The listing copy still contains a `Beta note:` section in the draft file. That is a repo drafting choice, not a live in-app badge.

## 28. Build and Release Configuration

The repo contains:

- `eas.json`
- Expo Updates configuration
- app manifest config
- static site render config

This means the project is already structured around:

- mobile builds
- OTA updates
- static web publishing

The repo is not a toy scaffold anymore, even though `README.md` still contains the default Expo starter text and is therefore not a truthful project overview.

## 29. Backend Architecture Truths

### 29.1 Current trust model

The correct current description is:

- the mobile client is still substantial
- the database layer now carries much more real authority than before
- important permissions and lifecycle operations have been moving into SQL migrations and RPCs

This is a better architecture than a pure "everything from client CRUD" model, but the app is still operationally client-heavy in state orchestration.

### 29.2 Supabase source of truth

`supabase/schema.sql` is explicitly described in the repo as a bootstrap snapshot, not the complete behavioral source of truth.

The real later behavior lives in timestamped migrations under `supabase/migrations/`.

### 29.3 Legacy SQL

The repo also contains:

- `supabase/migrations_legacy/`
- `manual-sql/`

These are historical and should not be treated as the current authoritative migration path for a new setup.

## 30. Important Current Migrations

The current timestamped migration chain in the repo includes:

- `20260409143000_backend_access_and_query_fixes.sql`
- `20260409152000_school_creator_becomes_owner.sql`
- `20260409174000_notifications_default_off.sql`
- `20260409190000_admin_school_review.sql`
- `20260409213000_school_review_admin_and_notifications.sql`
- `20260411103000_school_logo_uploads.sql`
- `20260411122000_school_owner_membership_and_no_limit.sql`
- `20260411124500_fetch_regional_epsu_suggestions.sql`
- `20260411131500_regional_suggestion_votes.sql`
- `20260411134500_review_regional_epsu_suggestions.sql`
- `20260411142000_approved_regional_suggestions_create_epsus.sql`
- `20260411150000_delete_legacy_null_country_regional_suggestions.sql`
- `20260412194000_restore_mute_helpers.sql`
- `20260413093000_posting_guidelines_acceptance.sql`
- `20260413101500_validate_reply_target_scope.sql`
- `20260413114000_expand_governance_action_audit.sql`
- `20260413123000_account_history_self_access.sql`
- `20260413152000_flagged_post_notifications.sql`
- `20260413170000_delete_own_account.sql`
- `20260414101000_compliance_cleanup.sql`
- `20260414133000_single_school_application_only.sql`
- `20260414195000_prevent_duplicate_user_suggestions.sql`
- `20260415153000_create_profiles_from_auth_users.sql`
- `20260415154000_restore_admincat_admin_status.sql`
- `20260415160000_push_notification_tokens.sql`
- `20260415190000_harden_push_invites_and_logos.sql`
- `20260418194500_moderation_action_reasons.sql`
- `20260419120000_auto_push_delivery_trigger.sql`
- `20260420103000_progressive_post_auto_delete_threshold.sql`
- `20260420114500_enforce_regional_and_school_membership_limits.sql`
- `20260420143000_hourly_queued_posts.sql`
- `20260420173000_block_post_authors.sql`

Those last four migrations are especially important because they materially changed the current product:

- progressive reaction-threshold deletion
- hard membership caps
- hourly queued post system
- anonymous-author blocking

## 31. Key Current Database Behaviors

From the repo's current migration and app contract, the backend now materially supports:

- account deletion
- policy acceptance tracking
- school logo storage behavior
- regional suggestion review
- school application handling
- moderation action audit expansion
- push token handling
- invite hardening
- moderation reasons
- queued hourly post lifecycle
- author blocking

This is why the app is no longer accurately described as "mostly frontend with a database." The backend logic footprint is now large and meaningfully product-defining.

## 32. Edge Function

There is a Supabase Edge Function in:

- `supabase/functions/send-push-notifications/index.ts`

This matters because older descriptions of the project as "no server-side code at all" are no longer accurate.

The existence of this function means the app's operational backend surface now includes:

- database-side SQL/RPC logic
- at least one server-side function for external notification delivery

## 33. App State Management Reality

The app still uses manual React state orchestration rather than a dedicated state framework like Redux or React Query.

That means:

- `app.js` remains an important root orchestrator
- state is passed across screens and hooks
- local transforms and bootstrap logic matter a lot
- some complexity is managed through helper modules rather than a formal store abstraction

This is workable, but it means `app.js` and the bootstrap/action helpers are still core architectural files.

## 34. The Current Role of `app.js`

`app.js` is not just a small entrypoint. It is one of the heaviest truth-holding files in the system.

It is responsible for:

- root navigation composition
- startup/loading state
- runtime state holders
- action wiring into screens
- long-lived screen props
- deep-link handling
- notification integration
- boot-time and periodic refresh behavior

If someone wants to understand the living product shape, `app.js` is one of the first files that matters.

## 35. The Current Role of `HomeScreen.js`

`HomeScreen.js` is where the feed-side product identity becomes visible.

It is responsible for showing:

- Epsu selection and visibility
- joined-first sorted ordering
- population-sorted community lists
- active feed content
- report/reply/block actions
- countdown and empty-state behavior between hourly drops

This file captures the practical feel of the product more than a backend schema ever can.

## 36. The Current Role of `PostScreen.js`

`PostScreen.js` is the front door to the app's central content act.

It now reflects several important truths:

- posting is queued, not instant
- keyword warnings are no longer surfaced to the user as a warning modal
- the app confirms queue/release timing instead of pretending the post is already live
- posting guidelines acceptance matters
- draft behavior exists

## 37. The Current Role of `ModQueueScreen.js`

`ModQueueScreen.js` is the most obvious operational safety screen in the app.

It now needs to reflect more than classic user reports alone, because the current system also treats queued keyword-flagged posts as a moderation concern before public release.

This makes the moderation model more proactive than a pure report-only product.

## 38. The Current Role of `SettingsScreen.js`

`SettingsScreen.js` is where policy, account, and trust surface to the user.

It is important because it now links the app to:

- legal pages
- account actions
- deletion paths
- informational materials

Settings is also where store reviewers often verify:

- that privacy material is reachable
- that account deletion exists
- that the app does not hide critical account control paths

## 39. Notification Model in Plain Language

The notification system is not "notifications everywhere by default." The current philosophy is:

- optional permission
- store token if user enables it
- use notifications for moderation and important updates
- separate notification creation from push delivery power

That matches both the drafted store docs and the current permission wording in `app.json`.

## 40. Storage Model in Plain Language

The main meaningful binary/file storage feature in the current product is school logo upload.

That means:

- the app needs photo library access only for that path
- storage policies matter mostly around logos
- the permission explanation and store disclosures are narrow and specific rather than broad

## 41. Current Account Deletion Model in Plain Language

If a user deletes their account:

- the account itself goes away
- many profile-linked records go away
- a still-live post does not vanish instantly if its lifecycle is still active
- instead, the author link is removed and the post survives only until its normal deletion cycle ends
- users cannot delete while they still manage an Epsu

That is now consistently reflected in:

- code
- public deletion page
- privacy policy

## 42. Current Safety Model in Plain Language

Epsu's current safety model is layered:

- content rules
- post reporting
- moderation queues
- moderator and owner actions
- admin review
- keyword-based pre-release flagging
- user-level anonymous-author blocking
- temporary muting
- reaction-based deletion

This is not a claim that the system is omniscient or fully automated. It is a claim that the product has multiple practical levers rather than just "let anything happen."

## 43. What Epsu Does Not Currently Center

The current repo does not center:

- public user profiles
- direct messages
- follows
- public social graph identity
- mentions/tags as a central primitive
- permanent post archives as a product promise
- analytics SDK instrumentation
- ads SDKs

Those absences are important because they shape both policy explanations and user expectations.

## 44. Current Policy/Store Positioning

The repo now supports a consistent reviewer story:

- anonymous-content app
- no visible author identities to ordinary users
- no DMs or social graph
- post reporting exists
- anonymous-author blocking exists
- account deletion exists
- permissions are narrow and justified
- hourly batch post system is real
- temporary content model is real

That is much stronger than the earlier state where the docs and code were not fully aligned.

## 45. Internal Repo Quality Reality

The repo is serious but not perfectly cleaned.

Important truths:

- `README.md` is still default Expo starter text and does not describe the real app
- there are still historical docs and legacy SQL folders
- there are long-form internal documents that overlap in purpose
- the repo has grown through active iteration rather than a single pristine architecture pass

That does not make it fake. It means the current grandplan has to distinguish:

- live source of truth
- historical archive
- outdated scaffold artifact

## 46. Which Files Are Authoritative Versus Historical

### 46.1 Authoritative now

- `app.js`
- current screen files
- `lib/api/*`
- `lib/useAppBootstrap.js`
- `lib/createCommunityActions.js`
- `lib/createAccountActions.js`
- `supabase/migrations/*.sql`
- `app.json`
- public legal pages in `site/`
- store docs in `docs/`

### 46.2 Historical or secondary

- `README.md`
- `TECHNICAL_REPORT.md` where it describes earlier system states that have since changed
- `manual-sql/`
- `supabase/migrations_legacy/`
- internal planning docs that describe former product assumptions

### 46.3 Important but not equal in authority

- `EPSU_MASTERPLAN.md`
- `LAUNCH_CHECKLIST.md`
- `ANALYTICS_PLAN.md`
- `BUSINESS_TODO.md`

These matter for context, but they are not more authoritative than current code and migrations.

## 47. Operational Facts That Matter

### 47.1 Long-running testing is still necessary

Because the current product includes:

- hourly release logic
- next-day expiry logic
- moderation-before-release behavior
- multi-user membership and block interactions

real testing still needs long-duration and multi-instance verification. That is an operational truth, not a lack of implementation.

### 47.2 Store-console work remains outside the repo

The repo contains the drafts, but not the completed console actions for:

- screenshots
- reviewer credentials
- Apple privacy form submission
- Google Data Safety form submission
- store metadata entry itself

### 47.3 Public site deployment remains outside the repo

The pages exist here, but being in the repo is not the same thing as being live on the public domain.

## 48. The Biggest System Secrets, Plainly

If "secrets" means the truths that are easy to miss from the surface, they are these:

- the product is much more backend-defined now than the UI alone suggests
- the hourly queue/expiry model changes the entire emotional rhythm of the app
- the app is intentionally non-archival
- anonymous blocking now exists without breaking anonymity
- school and regional communities are structurally different systems under one brand
- the repo contains both current truth and older fossil layers
- the legal/store/public text has been actively reshaped to match code instead of generic template language

## 49. Current File Inventory

Top-level repository items currently include:

- `.expo`
- `.vscode`
- `app`
- `assets`
- `components`
- `constants`
- `dist`
- `docs`
- `hooks`
- `lib`
- `manual-sql`
- `node_modules`
- `scripts`
- `site`
- `supabase`
- `.env`
- `.env.example`
- `.gitignore`
- `AdminScreen.js`
- `ANALYTICS_PLAN.md`
- `app.js`
- `app.json`
- `AppContext.js`
- `BUSINESS_TODO.md`
- `DeleteEpsuScreen.js`
- `DOMAIN_SETUP.md`
- `eas.json`
- `EPSU_MASTERPLAN.md`
- `eslint.config.js`
- `expo-env.d.ts`
- `ForgotPasswordScreen.js`
- `HomeScreen.js`
- `HOST_POLICY_DRAFT.md`
- `index.js`
- `JoinInviteScreen.js`
- `LAUNCH_CHECKLIST.md`
- `LoginScreen.js`
- `ModerationRecordsScreen.js`
- `ModQueueScreen.js`
- `OwnerMembersScreen.js`
- `OwnerModInviteScreen.js`
- `OwnerTeamScreen.js`
- `OwnerToolsScreen.js`
- `OwnerWorstUsersScreen.js`
- `package-lock.json`
- `package.json`
- `PostScreen.js`
- `README.md`
- `RegionalConfirmationScreen.js`
- `RentEpsuScreen.js`
- `ReportScreen.js`
- `ResetPasswordScreen.js`
- `SchoolApplicationScreen.js`
- `SettingsScreen.js`
- `SignUpScreen.js`
- `TECHNICAL_REPORT.md`
- `tsconfig.json`

## 50. Current `lib/` Inventory

Current important `lib/` files include:

- `useSubmitButtonAnimation.js`
- `useEpsuPresence.js`
- `useAppNotifications.js`
- `useAppBootstrap.js`
- `uiTheme.js`
- `supabase.js`
- `schoolLogo.js`
- `schoolApi.js`
- `notificationApi.js`
- `networkGuard.js`
- `helpResources.js`
- `flaggedPostKeywords.js`
- `epsuApi.js`
- `createCommunityActions.js`
- `createAccountActions.js`
- `countryCode.js`
- `countries.js`
- `appStateTransforms.js`
- `api/moderation.js`
- `api/feed.js`
- `api/epsus.js`
- `api/account.js`

## 51. Current `docs/` Inventory

Current store and review support docs include:

- `APPLE_APP_PRIVACY_DETAILS.md`
- `GOOGLE_PLAY_DATA_SAFETY.md`
- `APP_LISTING_COPY.md`
- `APPLE_REVIEW_NOTES.md`
- `GOOGLE_PLAY_REVIEW_NOTES.md`

## 52. Current `site/` Inventory

Current site files include:

- `terms.html`
- `system-report.html`
- `styles.css`
- `render.yaml`
- `README.md`
- `privacy.html`
- `mod.html`
- `join.html`
- `index.html`
- `guidelines.html`
- `epsu-master-report.html`
- `delete-account.html`

## 53. Current `supabase/` Inventory

Current important Supabase-side items include:

- `schema.sql`
- `README.md`
- `functions/send-push-notifications/index.ts`
- timestamped migrations under `migrations/`
- historical migrations under `migrations_legacy/`
- legacy manual SQL in `manual-sql/`

## 54. Closing Statement

The current Epsu repository is a real product system, not a loose concept. Its defining truths are:

- anonymous public posting with backend accountability
- place and school bounded communities
- strong role and membership logic
- temporary hourly-batch content lifecycle
- report, moderation, and block-author safety tools
- Supabase-backed backend authority
- public/legal/store documents that now largely match the actual app

The repo still contains historical layers and unfinished cleanup areas, but the core product identity is now coherent:

Epsu is a short-lived anonymous local-community app with real governance, real lifecycle rules, and a backend/data model that actually enforces those claims.
