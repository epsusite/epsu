# Epsu Masterplan

## 1. Scope

This masterplan consolidates the non-legal Epsu materials: `TECHNICAL_REPORT.md`, `site/epsu-master-report.html`, `site/system-report.html`, `ANALYTICS_PLAN.md`, `BUSINESS_TODO.md`, and `LAUNCH_CHECKLIST.md`. It excludes legal and policy texts such as terms, privacy, guidelines, and host policy wording. The purpose is to convert the technical reports, launch thinking, analytics plan, and business notes into one execution document.

The longest source is `TECHNICAL_REPORT.md`, at 44,219 bytes. The final target is a masterplan above 88,438 bytes. This file is written as a practical operating plan: what Epsu is, how it should work, what must be built, what must be measured, what must be delayed, and how technical work connects to product and business direction.

## 2. Product Thesis

Epsu is a mobile-first anonymous local community product. It organizes participation around Epsus: place-based or institution-based spaces such as schools, cities, countries, towns, or future private communities. The product's value is not a global feed. The value is local context: people posting about a real environment they share.

Epsu should be understood as pseudonymous infrastructure with public anonymity. The backend knows the user. Normal feed readers do not see the user's identity. Moderators and admins may need scoped visibility through backend records. This distinction must stay clear because it affects product language, safety design, account history, deletion, moderation logs, and user trust.

The product should launch small. A small active school is more valuable than many empty regions. One returning community proves more than broad availability. The first strategic goal is not monetization, not press, and not national expansion. The first goal is repeat participation in one or more bounded local communities without moderation collapse.

## 3. Current System

The current system is an Expo React Native app backed by Supabase Auth, Postgres, Storage, RPCs, RLS, and an Edge Function for push notifications. The public site is static HTML/CSS. The app contains authentication, home feed, posting, reporting, moderation queue, owner tools, admin review, school applications, notification preferences, account history, account requests, password reset, and account deletion surfaces.

The backend stores profiles, Epsus, memberships, posts, reactions, reports, moderation actions, invites, suggestions, school applications, notifications, push tokens, presence, subscriptions, and account requests. Sensitive mutations increasingly use backend RPCs. This is the correct direction. The mobile client should request actions; the backend should decide whether those actions are allowed.

The system is no longer a pure prototype, but it is still early-stage. It needs continued hardening, launch testing, analytics instrumentation, operational process, and product focus.

## 4. Target System

The target system keeps Supabase as the backend platform while making authority explicit. The app should not become a custom server project unless Supabase constraints force that decision. Instead, Epsu should continue moving privileged work into database functions, RLS policies, Storage policies, Edge Functions, and scheduled jobs.

The target system must satisfy these rules:

- Normal users can request account, post, report, reaction, application, and membership actions.
- Owners and hosts can manage only their own Epsus.
- Moderators can moderate only their assigned Epsus.
- Platform admins can review pending communities and perform global operations.
- Push delivery cannot be triggered by arbitrary clients.
- Storage writes are scoped to the authenticated uploader or backend.
- Every governance action is logged.
- Every launch-critical flow has a test path.
- Every future monetization feature has a governance prerequisite.

## 5. Core User Journey

A user signs up, logs in, gets a profile, lands in relevant Epsus, reads posts, creates anonymous posts, replies, reacts, reports, applies to schools, receives notifications, and manages account settings. The app should minimize confusion around where the user is posting and what membership state they have.

The journey fails if the user lands in an empty or unclear community. The first screen after login should make Epsu availability and action choices obvious. If the user is already active in a regional Epsu, show that. If the user can apply to a school, make that path clear. If the user has no relevant Epsu, suggestions must feel useful rather than like a dead end.

The first-use goal is simple: the user understands where they are, sees or creates local content, and has a reason to return.

## 6. Community Types

Epsu communities should not all behave the same.

Regional Epsus are city, state, country, district, town, or similar place-based communities. They should be easy to join once approved and visible. School Epsus are institution-based and should support application, owner/host review, logo, website, country, and admin approval. Private Epsus exist as a possible later scope but should not be expanded until public and school communities are stable. Suggestions are not full communities; they are demand signals.

Each type needs different rules:

- A country Epsu can be joined automatically or suggested from country.
- A city Epsu can be user-joined.
- A school Epsu should require application or invitation.
- A private Epsu should require invite-only access.
- A rejected Epsu should not behave like a hidden approved Epsu.
- A pending school should be visible to admins and creator, not general users.

## 7. Identity

Identity has three layers: authentication identity, profile identity, and contextual role. Authentication identity lives in Supabase Auth. Profile identity lives in `profiles`. Contextual role lives in `epsu_memberships`. A user can be ordinary in one Epsu, moderator in another, owner in a school, and platform admin globally.

The app must avoid treating local power as global power. A host is not an admin. A moderator is not an owner. An owner is not necessarily a company representative. Admin is a rare platform role. Each role should map to backend checks, not just hidden UI buttons.

Profile data should remain minimal. Country supports regional membership. Birth date supports age gating. Notification preference supports push and in-app notification behavior. Admin flag supports platform review. Guideline acceptance records onboarding state. Username supports internal profile identity but should not automatically appear on anonymous posts.

## 8. Anonymity

Epsu anonymity should mean that posts are not shown under the user's name in the normal feed. It should not mean the platform has no record of authorship. The backend must preserve authorship for reports, account history, moderation, abuse prevention, and deletion handling.

The product should never describe anonymity in a way that conflicts with the database. Internally, the right term is public anonymity with backend accountability. That keeps expectations accurate.

The UI should protect the anonymous experience. Feed cards should show post number, title, body, counts, reply context, and status, but not the author's username. Moderation tools can show labels or internal references when necessary. Account history can show the user's own posts because it is private to that user.

## 9. Feed

The feed is the primary product surface. It must show active posts from Epsus the user can access. It must respect membership, status, Epsu review state, and post state. It should not show deleted-by-moderator posts as normal content. It should not show school content to non-members. It should not show kicked users normal entry.

The feed should make local context obvious. The user must know which Epsu they are viewing. Post numbers help create local continuity. Replies should show enough parent context to make the conversation understandable.

Future feed improvements should include pagination, per-Epsu filtering, clearer empty states, reply grouping, better stale state refresh, and controlled discovery. A global infinite feed is not the next step.

## 10. Posting

Posting is a backend-authorized action. The user must be authenticated, must be able to access the Epsu, must not be muted, and must provide valid title/body content. If replying, the reply target must exist, be active, and belong to the same Epsu.

The backend should remain the final authority. The client can validate early for UX, but the RPC must validate again. This prevents manual API calls from bypassing UI checks.

The flagged-keyword flow should remain a warning and notification mechanism, not a complete moderation system. If a user posts after a warning, the system can notify moderators. Push delivery must remain separate and protected. In-app notification creation is one operation; push delivery is another.

Posting metrics should include composer opens, submit attempts, successful posts, failed posts, warning overrides, replies, and first-post conversion.

## 11. Replies

Replies are posts with `reply_to_post_id`. They must remain scoped to the same Epsu as the parent. The backend must reject cross-Epsu replies and self-replies. If the parent disappears before submission, the product must decide whether to fall back to a normal post or ask the user to confirm.

Replies should be measured separately from top-level posts. A community with replies is more alive than a community with only isolated posts. Reply rate is a better conversation metric than raw post count.

The UI should show reply context without turning the feed into a complex threaded forum too early. A simple parent preview is enough for launch.

## 12. Reactions

Reactions are lightweight community feedback. They currently support like and dislike. Duplicate reactions should be prevented. Reaction count updates should happen transactionally. A reaction must only be allowed if the user can view the post and participate in the Epsu.

Dislike-based removal is powerful and risky. A fixed threshold can work in a prototype but may fail in small or adversarial communities. Future threshold rules should consider community size, distinct voters, membership age, account age, report context, and whether the Epsu is school or regional.

Likes and dislikes should not replace reports. Dislike means unpopular or low quality. Report means potentially harmful, abusive, or rule-breaking.

## 13. Reports

Reports are formal moderation inputs. A report should include reporter, post, reason, optional explanation, status, and timestamp. Duplicate reports by the same profile on the same post should be prevented. Reports should be visible to moderators and owners scoped to the relevant Epsu.

The report flow should be fast. If it feels too heavy, users will not report. Reasons should be limited at launch. Explanations should help but not block every report.

Report metrics should include reports per Epsu, reports per post, distinct reporters, report resolution time, dismissal rate, removal rate, mute rate, and repeat reported authors.

## 14. Moderation Queue

The moderation queue turns reports into decisions. It should show open reports, post context, reason, time, post number, and available actions. Core actions are dismiss report, remove post, and mute author. Owner screens should also support application review, member management, moderator role changes, records, and worst-user analysis.

Every moderation action should create a moderation action record. The record must include actor, target where relevant, Epsu, post where relevant, action type, details, and timestamp. This is operational evidence. It is not public shaming.

The moderation queue should refresh after actions. If role access changes, the UI should fail cleanly and reload scoped memberships.

## 15. Owners, Hosts, and Moderators

The database currently uses owner and moderator roles. The business model may later use the term host for paid or temporary school/community control. Product language can evolve, but backend authority must stay precise.

Moderators can resolve reports and mute authors. Owners can manage memberships, applications, moderators, invites, and owned Epsus. Admins can review global pending items. These powers must not bleed into each other.

School host control should eventually be term-based, not permanent ownership. A host term should define start, end, renewal, inactivity handling, abuse handling, and handoff. That belongs to product governance before it becomes monetization.

## 16. Admin

Admin tools should focus on platform-level work: pending school review, regional suggestion review, push queue delivery, account request review, global metrics, failed backend jobs, and intervention in governance disputes. Admin access must be backend-checked. UI visibility is not security.

The admin screen should remain practical. It should show pending work and operational actions. It does not need decorative analytics. It needs reliable queues.

Admin operations should be logged where they change product state. Reviewing a school, rejecting a suggestion, or triggering delivery should be traceable enough for later review.

## 17. School Epsus

Schools are the best early wedge because they have real shared context. A school Epsu should include name, slug, code, website, country, logo path, review status, owner/host relation, and memberships. School creation should require logo and website at the current product stage because those help admin review and visual trust.

A school should begin pending. Admin approval makes it visible. The creator may get owner status immediately, but broad access should wait for review. Users apply with a short answer. Owners review applications. Kicked users should not reapply through ordinary flows.

The launch should choose schools where at least one person will actually post. A school with no seed user is not a product test.

## 18. Regional Epsus

Regional Epsus represent places. They should remain easier to join than schools. A user country can automatically ensure country-level membership, but city or district membership should be more deliberate unless the app later adds reliable location or declared locality.

Regional suggestions are the right demand signal before broad creation. Users should be able to request a place. Admins should approve only where there is plausible activity. Approval should create an Epsu and allow joining.

Regional hosting should wait. Large-city hosting is especially risky because one host may gain too much scope. District-level or small-town hosts may be more manageable later.

## 19. Suggestions

Suggestions measure where users want Epsus. A suggestion has profile, title, country, status, and perhaps vote count. Duplicate prevention matters because suggestions can otherwise become spam.

Suggestions should not automatically become communities. They should be reviewed against demand, launch capacity, moderation capacity, and seed activity. A suggestion with several real users is stronger than a single request for a large city.

Suggestion analytics should track title-country pairs, requester count, vote count, approval rate, and post-approval activity.

## 20. Invites

Invites support controlled access and moderator onboarding. Owners can create one-use invites for member or moderator roles. Tokens should be generated server-side or through secured RPC logic, not weak client randomness.

Invite redemption must be an RPC. The backend should lock the invite, verify it is active, verify use count, create or update membership, increment use count, deactivate exhausted invites, and return role/status result. Member invites can create `invited` status. Moderator invites can grant active moderator status if that is the intended flow.

Invite landing pages should not redeem directly. They should guide users into the app.

## 21. Notifications

Notifications have two layers. In-app notifications are database records. Push notifications are external delivery through Expo. Users may create events that produce in-app notifications, but ordinary users must not trigger the push sender for everyone.

The protected Edge Function should require platform-admin authorization or a private delivery secret. Future scheduled delivery should use `PUSH_DELIVERY_SECRET`. Manual admin delivery is acceptable for early launch.

Push handling must track sent time, errors, Expo tickets, delayed receipts, and invalid tokens. Missing tokens should not break notification creation.

## 22. Push Tokens

Push tokens belong to profiles. A user may have multiple tokens across installs or devices. Tokens should store profile, token, platform, enabled flag, created time, and last seen time. Registering should upsert. Unregistering should disable.

Client storage should remember the last token so logout can unregister it. The backend must also handle stale tokens because logout is not guaranteed. Expo `DeviceNotRegistered` should disable the token.

Notification permission should be opt-in. Default-off is safer for launch.

## 23. Storage

School logos are stored in Supabase Storage, not only on the developer machine. Public read is intentional because logos are visual identifiers in the community catalog. Write access is the sensitive part. Authenticated users should upload only under their own folder, and delete only their own uploaded objects unless a backend function performs cleanup.

The current path direction is `epsus/<profile-id>/<slug>-<timestamp>.jpg`. That gives Storage policies something concrete to check. Future work should add file size validation, file type validation, image dimension limits, moderation of uploaded logos if abuse appears, and cleanup for orphaned logos after rejected schools or failed create flows.

The logo path stored on an Epsu should be treated as a pointer, not trusted user text. The app should never construct arbitrary bucket paths from raw unsanitized user input.

## 24. Data Model

The data model should stay explicit and bounded. `profiles` stores app profile state. `epsus` stores community identity and review status. `epsu_memberships` connects profiles to Epsus through role and status. `posts` stores anonymous feed content. `post_reactions` stores likes and dislikes. `post_reports` stores formal moderation signals. `moderation_actions` stores governance events. `epsu_invites` stores controlled access tokens. `epsu_suggestions` stores demand for new communities. `epsu_join_applications` stores school access requests. `app_notifications` stores in-app notification records. `profile_push_tokens` stores delivery endpoints. `epsu_presence` stores current or recent presence. `account_requests` stores correction and support-style account requests.

No table should become an unstructured dumping ground. If a future feature needs new state, it should name the owner, access policy, lifecycle, retention, and index needs.

The schema should prefer constrained text enums for early product states. Full database enum types can come later if migration discipline improves. For now, check constraints are readable and flexible.

## 25. Backend Authority

The central backend rule is that the app is a request origin, not the authority. The client can ask to post, join, apply, review, mute, invite, redeem, or deliver. The backend decides.

RPCs should be used for any operation that has one or more of these properties:

- It changes multiple tables.
- It depends on membership, owner, moderator, or admin role.
- It must be atomic.
- It creates audit records.
- It consumes a token.
- It changes account lifecycle.
- It updates counters.
- It changes content visibility.

Simple direct client writes can remain only where RLS makes ownership trivial and the write is low risk. Even then, RPCs are often clearer once the product flow becomes important.

## 26. RLS

Row Level Security is the baseline. Every table with user or community data should have RLS enabled. Policies should be narrow and readable. The policy should answer: who can select, who can insert, who can update, who can delete, and under what condition.

Common RLS patterns:

- Profile owner can update their own profile.
- Authenticated users can select limited profile data if the product needs display.
- Members can view their own memberships.
- Owners and moderators can view scoped memberships.
- Users can select active posts in Epsus they can access.
- Reporters can see their own reports.
- Moderators can see reports for their Epsus.
- Users can manage their own push tokens.
- Users can read their own notifications.
- Admin functions bypass normal table policies through `security definer` after checking admin status.

RLS should be tested with negative cases. A policy that works for the happy path but leaks cross-Epsu data is not acceptable.

## 27. Edge Functions

Edge Functions are for external service calls and privileged work that cannot live purely in Postgres. Push delivery is the current example because it calls Expo. Future examples may include scheduled cleanup, billing webhooks, receipt validation, email delivery, analytics export, or admin data export.

Every Edge Function must choose an auth model:

- Verified user JWT.
- Platform admin check.
- Shared secret header.
- Webhook signature.
- Internal scheduled job secret.

If platform JWT verification is disabled, the function must enforce its own check before doing work. A public function URL is not a security boundary.

Edge Functions should return compact JSON, avoid leaking secrets, and log enough operational context to debug failures.

## 28. Account Lifecycle

Account lifecycle includes signup, login, password reset, profile hydration, country updates, notification preferences, account history, correction request, export-style visibility, delete account, logout, and token cleanup.

Signup must create an Auth user and profile. If email verification blocks immediate session creation, the app should tell the user clearly. Login must hydrate profile and app state. Password reset must return the user through the app scheme and update password metadata if still used. Country update must update profile, auth metadata if necessary, and regional memberships. Logout should clear presence and unregister push token where possible.

Deletion must be real. It should remove or anonymize data while preserving moderation integrity where required. Deleted users should not leave the app in an authenticated but broken state.

## 29. Account History

Account history is both a user trust feature and a debugging feature. It should show the user's own posts, reactions, reports, notifications, memberships, suggestions, owned Epsus, moderation actions involving them, school applications, and account requests. It should not reveal other users unnecessarily.

History should tolerate missing linked records. Deleted posts, deleted Epsus, and old moderation actions should not break the page. The UI should show "Unknown Epsu" or "Unknown post" when necessary.

Future export should produce a downloadable JSON or text file. Early launch can use in-app history as long as it is accurate and scoped.

## 30. Account Requests

Account requests currently support correction. That is enough for launch, but only if someone checks them. A request should have profile, type, message, status, created time, and resolved time. Admins need a future queue to review and update requests.

Do not add many request types prematurely. Start with correction. Add access issue, deletion issue, moderation appeal, or host dispute only when support volume proves they are needed.

Metrics should include open requests, average age, resolved requests, repeated themes, and requests by launch community.

## 31. Analytics

Analytics should answer decisions, not vanity. Use Metabase for database and business statistics. Use PostHog for behavioral product analytics.

Metabase should answer:

- How many users exist.
- Which Epsus are active.
- Which Epsus are dead.
- How many posts and replies happen.
- How many reports happen.
- How much moderation work exists.
- Which schools have applications.
- Which communities are growing.

PostHog should answer:

- Whether onboarding works.
- Where signup fails.
- Whether users open the composer.
- Whether users submit posts.
- Whether users abandon school applications.
- Whether users return after day one.
- Whether users return after day seven.
- Whether notification opt-in changes return behavior.

Do not add analytics before launch blocks are fixed. But once launch begins, analytics should become a priority because manual impressions are unreliable.

## 32. Metrics

Core launch metrics:

- Active users per Epsu.
- Posts per Epsu.
- Replies per Epsu.
- Posts per active user.
- Replies per post.
- Reports per Epsu.
- Report resolution time.
- School application starts.
- School application submissions.
- School application approvals.
- Invites generated.
- Invites redeemed.
- Notification opt-in.
- Push delivery success.
- Day-one return.
- Day-seven return.

Interpretation matters. A lot of reports can mean engaged safety use or unhealthy content. A lot of signups with no posts means onboarding or empty-feed failure. A lot of applications with few approvals means owner inactivity or poor applicant quality. A lot of suggestions means demand, but not necessarily launch readiness.

## 33. Event Tracking

PostHog events should be stable and non-sensitive. Suggested event names:

- `app_opened`
- `signup_started`
- `signup_completed`
- `login_completed`
- `country_selected`
- `epsu_list_viewed`
- `epsu_opened`
- `post_composer_opened`
- `post_submitted`
- `post_failed`
- `reply_started`
- `reaction_submitted`
- `report_started`
- `report_submitted`
- `school_application_started`
- `school_application_submitted`
- `notification_prompt_shown`
- `notification_enabled`
- `account_history_opened`
- `delete_account_started`
- `delete_account_completed`

Do not send post body, report explanation, email, birth date, push token, invite token, or raw password metadata to analytics. Use safe properties such as Epsu scope, membership state, flow result, and error category.

## 34. Metabase Dashboards

Initial Metabase dashboards:

- Global health: users, posts, reports, applications, notifications, active Epsus.
- Launch cohort: three schools and one regional Epsu tracked daily.
- Community activity: posts, replies, active members, reports by Epsu.
- Moderation load: open reports, actions, resolution time, repeat reported authors.
- School operations: pending schools, applications, approvals, rejections, owner activity.
- Notification delivery: pending notifications, push sent, push errors, disabled tokens.
- Account support: correction requests, deletion counts, account history usage.

Admin dashboards can be broad. Host dashboards must be scoped to the host's Epsu and should avoid raw personal data.

## 35. Launch Scope

Soft launch should stay small: three schools and one regional Epsu. Each selected Epsu must have at least one real person ready to post. A launch without seed posts is not a fair product test.

The launch should not include paid hosts, regional ads, broad promotion, third-party ad networks, or complex dashboards. It should test core behavior: do users return to a local anonymous space?

Launch duration should allow day-one and day-seven retention. The team should record daily metrics and qualitative notes.

## 36. Launch Readiness

Before launch, test:

- Signup.
- Login.
- Password reset.
- Country update.
- Feed load.
- Post creation.
- Reply creation.
- Like and dislike.
- Report creation.
- Moderation queue.
- Dismiss report.
- Remove post.
- Mute author.
- School creation with logo.
- Admin school approval.
- School application.
- Owner application review.
- Invite creation.
- Invite redemption.
- Moderator invite redemption.
- Account history.
- Correction request.
- Delete account.
- Notification opt-in.
- Push token registration.
- Admin push delivery.

Launch is not ready if reports fail, account access fails, posting fails, owner review fails, or push delivery can be triggered by unauthorized users.

## 37. Go and No-Go

Go requires a working app, working backend, monitored support path, launch Epsus, seed users, and moderation readiness. No-go should trigger on any critical account, posting, reporting, moderation, or authorization failure.

Go criteria:

- At least one school has real seed participation.
- One regional Epsu has a plausible first audience.
- Signup and login work repeatedly.
- Posts and replies save correctly.
- Reports reach the moderation queue.
- Moderators can resolve reports.
- Owners can review applications.
- Admins can review pending schools and suggestions.
- Account deletion works.
- Unauthorized push delivery is blocked.
- Support inbox is monitored.

No-go criteria:

- Users cannot reliably authenticate.
- Feed access leaks private school content.
- Posting writes incorrect Epsu data.
- Reports disappear.
- Moderation actions fail silently.
- Invites cannot be redeemed.
- Admin review cannot approve schools.
- Storage upload breaks school creation.
- Push delivery is public.
- A known data-loss bug remains open.

## 38. Business Position

Epsu is pre-monetization. The current job is evidence, not revenue. Costs should remain low. Company formation should wait until payments, contracts, grants, formal ownership, or app-store/business-account needs make it necessary.

The business should avoid pretending that host licensing, regional ads, or paid unlocks are validated. They are directions, not facts. The facts to collect are activity, retention, moderation load, school demand, host usefulness, and support burden.

The first business milestone is not first revenue. The first milestone is one local community that returns without being forced.

## 39. Company Setup

An Estonian company can be registered when there is a clear reason. Possible triggers are payments, formal host contracts, grants, bank account needs, app store ownership, infrastructure account ownership, or investor conversations.

Before that, keep records organized:

- Code ownership.
- Domain ownership.
- Brand assets.
- App store accounts.
- Supabase account.
- Expo account.
- Render account.
- Analytics accounts.
- Support email.
- Launch metrics.
- Financial records.
- Agreements.

Do not casually promise equity. Do not leave infrastructure ownership unclear. Do not mix future company money with personal money after company formation.

## 40. Data Room

The data room should be simple and useful. It should include folders for company, finance, product metrics, contracts, infrastructure accounts, launch notes, grants, and major decisions. The point is not investor theater. The point is reconstructability.

The data room should answer:

- Who owns the code?
- Who owns the domain?
- Who controls Supabase?
- Who controls app store access?
- What communities launched?
- What metrics did they produce?
- What support issues appeared?
- What money was spent?
- What agreements exist?
- What risks were known?

Keeping this updated makes grants, company setup, partnership, sale, or shutdown easier.

## 41. Monetization

The first serious monetization path is school host licensing. The second is direct regional advertising. The third is expanded host capacity or paid operational tooling. None should launch before governance and activity are proven.

School host licensing requires:

- Active school community.
- Host eligibility model.
- Host term length.
- Admin approval.
- Revocation process.
- Handoff process.
- Local metrics.
- Moderation logs.
- Refund or early termination thinking.

Regional advertising requires:

- Active regional Epsu.
- Direct advertiser relationship.
- Admin approval.
- No third-party ad network at first.
- Clear placement rules.
- User experience restraint.

Paid unlocks require caution because paid control can create governance abuse.

## 42. School Host Model

School control should become a host term rather than permanent ownership. A host should be a current student or otherwise legitimate school participant. Verification can start with school email. Student ID should be optional and used only if needed.

Host responsibilities:

- Review applications.
- Keep member queue moving.
- Use moderation tools responsibly.
- Avoid abusing power.
- Keep the school Epsu active.
- Respond to admin checks.
- Transfer control when term ends.

Host limits:

- No global data access.
- No control outside assigned school.
- No final control over company money.
- No ability to bypass admin review.
- No permanent ownership claim.

Host metrics should include application response time, moderation actions, activity, reports, and complaints.

## 43. Regional Host Model

Regional hosting is more dangerous than school hosting because regional boundaries are less clear. Large cities should not immediately have one paid host. Districts, neighborhoods, towns, or smaller regions may be safer.

Regional host eligibility should start from activity. A person who already participates constructively may be a better host than someone with formal proof but no product behavior. Proof should appear when money, disputes, or abuse require it.

Regional hosts should not control ad approval or money flow at first. They may later suggest local advertisers, but admin should approve. A host should not be able to sell access to a community's attention without platform review.

## 44. Funding

Early funding should be small and local. Possible sources:

- Municipality youth grants.
- School support.
- Student council support.
- University entrepreneurship support.
- Local digital civic grants.
- Small project grants under five hundred euros.

Large startup funding is premature without retention. Investors or bigger grants should see evidence: active Epsus, return rates, moderation records, user feedback, and a clear governance model.

Funding should not force broad expansion before product evidence exists.

## 45. Contracts

Contracts become relevant when hosts pay, hosts are paid, advertisers pay, grants require formal reporting, or collaborators contribute under defined ownership expectations. Until then, avoid complex agreements.

Principles:

- Hosts are not staff unless explicitly contracted as such.
- Paid hosts need revocable terms.
- Advertisers should not control community moderation.
- Contributors need written ownership clarity.
- Refund rules should exist before paid terms.
- Safety removal should override commercial preference.

Contracts should formalize a working product model, not invent one.

## 46. Cost Model

Cost surfaces include Supabase, Expo/EAS, Render, domain, app store accounts, email, analytics, future company registration, payment processing, and support time. Infrastructure cost is not the only cost. Moderation and support are real operational costs.

Cost rules:

- Keep static site simple.
- Avoid paid analytics until launch metrics matter.
- Avoid third-party ads early.
- Avoid custom backend until needed.
- Monitor Supabase usage after launch.
- Use small manual operations before automating everything.

The cheapest system is not always best. The right system is one that keeps launch risk low without creating unnecessary commitments.

## 47. Roadmap Phase Zero

Phase Zero is pre-launch hardening. It includes backend authority, stale code removal, push protection, invite RPC redemption, storage policy hardening, account lifecycle testing, moderation testing, and launch setup.

Exit criteria:

- Lint passes.
- Database migration applied.
- Edge Function deployed.
- Unauthorized push call returns 401.
- Invite redemption uses RPC.
- Logo upload uses scoped path.
- Admin screen works.
- Owner screen works.
- Moderation queue works.
- Delete account works.
- Support contact monitored.

Phase Zero is not about new features. It is about avoiding obvious launch failures.

## 48. Roadmap Phase One

Phase One is controlled soft launch. Launch to three schools and one regional Epsu. Recruit seed users. Watch behavior. Keep issue list. Measure day-one and day-seven retention.

Work:

- Prepare launch Epsus.
- Confirm seed posters.
- Run manual test checklist.
- Monitor support inbox.
- Monitor reports daily.
- Review pending schools and suggestions.
- Track metrics manually if analytics is not ready.
- Record feedback.
- Fix blockers quickly.

Exit criteria:

- At least one Epsu shows repeat use.
- No critical account or moderation bug remains.
- The team understands why inactive Epsus failed.
- The next iteration is evidence-based.

## 49. Roadmap Phase Two

Phase Two is instrumentation and governance refinement. Add PostHog and Metabase if launch produces enough activity. Improve admin queues. Add account request review. Improve host tools. Tighten school application and member management flows.

Potential work:

- Product analytics events.
- Database dashboards.
- Host-specific activity summary.
- Failed push delivery view.
- Account request admin queue.
- Better moderation records.
- Report stale-age indicators.
- Feed pagination if needed.
- Suggestion clustering.
- School email verification.

This phase should not rush monetization. It should turn launch data into a more reliable product.

## 50. Roadmap Phase Three

Phase Three is monetization experimentation. It starts only if communities show activity. Experiments should be small and reversible.

Possible experiments:

- One school host term.
- One sponsored school launch.
- One local direct regional ad.
- One host dashboard.
- One grant-funded expansion.

Each experiment needs success criteria, failure criteria, support expectation, and governance review. Revenue that damages trust is not useful.

## 51. Roadmap Phase Four

Phase Four is organizational hardening. Register company if needed. Move assets into company control. Create bank account. Keep records. Write operational procedures. Prepare contracts. Set up regular metrics review.

This phase becomes urgent when money, partners, app store ownership, or formal school relationships enter the picture.

The company should stay simple until complexity is justified.

## 52. Architecture Direction

The technical direction is incremental hardening, not rewrite. Keep Expo. Keep Supabase. Use RPCs for transactions. Use RLS for row access. Use Edge Functions for external services. Use Storage policies for upload scope. Use admin screens for operations.

Frontend direction:

- Screens render data and call actions.
- Actions orchestrate flows.
- API modules talk to Supabase.
- State transforms stay deterministic.
- Bootstrap remains clear.
- Notifications are isolated.

Backend direction:

- Migrations define schema and policies.
- RPCs enforce authority.
- Edge Functions guard external work.
- Scheduled jobs use secrets.
- Logs and records support audit.

Do not introduce a custom backend until the product has a reason.

## 53. Frontend Direction

The app should continue extracting complexity from `app.js` into focused modules. Priority should follow risk, not aesthetics. Already useful separations include account actions, community actions, app bootstrap, notifications, app state transforms, and API modules.

Future frontend work:

- Move feed-specific state into a focused hook.
- Move moderation queue state into a focused hook.
- Move admin review state into a focused hook.
- Add reusable loading/error patterns.
- Add better empty states.
- Add pagination without rewriting the whole feed.

The UI should remain app-first, not marketing-first. Users should land in the product, not a brochure.

## 54. Backend Direction

Backend work should concentrate on permissioned workflows:

- Create post.
- React to post.
- Report post.
- Dismiss report.
- Remove post.
- Mute member.
- Join regional Epsu.
- Apply to school.
- Review school application.
- Generate invite.
- Redeem invite.
- Register push token.
- Deliver push queue.
- Delete account.
- Delete Epsu.
- Review pending school.
- Review regional suggestion.

Every new workflow should ask: can this be safely done as a direct table write? If not, build an RPC or Edge Function.

## 55. Security Priorities

Priority one:

- Rotate exposed secrets.
- Prevent public push delivery.
- Keep service role keys out of client.
- Enforce admin checks on admin actions.
- Enforce owner checks on owner actions.
- Enforce moderator checks on moderation actions.
- Keep invite redemption backend-controlled.

Priority two:

- Test RLS with negative cases.
- Limit Storage writes.
- Avoid exposing account history cross-user.
- Avoid exposing school pending data to normal users.
- Protect push tokens.
- Log governance actions.

Priority three:

- Add automated security tests.
- Review query policies.
- Add structured incident response.

## 56. Secret Handling

The app may include publishable Supabase URL and anon/publishable key. It must never include service role keys. CLI access tokens are sensitive and should be rotated after being pasted into chat or logs.

Edge Function secrets should live in Supabase secrets. `PUSH_DELIVERY_SECRET` should be set before scheduled delivery exists. Scheduled callers should send `x-epsu-push-secret`. Admin users can also invoke delivery through authenticated function calls if backend admin check passes.

Secrets should not appear in docs, screenshots, support tickets, or source files.

## 57. Testing Strategy

Testing should start with the flows most likely to break trust:

- Auth.
- Posting.
- Reporting.
- Moderation.
- School application.
- Owner review.
- Invite redemption.
- Push delivery authorization.
- Account deletion.
- Storage upload.

Automated tests should be added around pure transforms, validation, API wrapper behavior, and backend contracts. Manual tests are acceptable for soft launch if they are written and repeated.

Negative tests matter. A normal user should fail to call admin actions. A non-owner should fail to manage members. A kicked user should fail to rejoin. An unauthenticated caller should fail to deliver push.

## 58. Observability

Observability should cover app health, backend health, moderation health, and launch health.

App health:

- Crashes.
- Signup failures.
- Login failures.
- Post failures.
- Screen load failures.

Backend health:

- RPC errors.
- Edge Function errors.
- Push errors.
- Storage errors.
- Slow queries.

Moderation health:

- Open reports.
- Stale reports.
- Moderator action counts.
- Removed posts.
- Muted users.

Launch health:

- Active users.
- Posts.
- Replies.
- Reports.
- Return rate.
- Support issues.

## 59. Operations

Daily launch operations:

- Check support inbox.
- Check pending school reviews.
- Check regional suggestions.
- Check open reports.
- Check failed push delivery.
- Check account requests.
- Record metrics.
- Update issue list.

Weekly operations:

- Review active Epsus.
- Review inactive Epsus.
- Review moderation actions.
- Review user feedback.
- Review costs.
- Review roadmap priorities.

Operations can be manual early, but they must be explicit. Manual does not mean forgotten.

## 60. Incident Response

Incident types:

- Security incident.
- Data exposure.
- Account access failure.
- Posting outage.
- Moderation failure.
- Host abuse.
- Push notification abuse.
- Storage abuse.
- App build failure.

Response sequence:

- Stop harm.
- Preserve context.
- Revoke or rotate access if needed.
- Patch.
- Deploy.
- Verify.
- Record what happened.
- Add prevention task.

Any leaked token should be rotated. Any broken authorization path should get a negative test.

## 61. Documentation

Documentation should be split by audience. Internal technical documentation should describe schema, RPCs, RLS policies, Edge Functions, Storage buckets, deployment, environment variables, testing flows, and operational procedures. Product documentation should describe what Epsu is, how communities work, how school applications work, how hosts and moderators operate, and how launch metrics are interpreted.

Existing technical reports should be treated as historical snapshots. They are useful because they show how the system was understood at a point in time, but they should not be the only source of truth after backend changes. This masterplan should become the execution reference. If the app behavior changes, the masterplan should be updated or superseded.

## 62. Public Site Direction

The public site should stay static unless there is a clear need for dynamic behavior. It should support discovery, trust, invite landing, public explanation, and documentation. It should not become a second app.

The public site should have:

- A clear homepage.
- Invite landing pages.
- A lightweight system or status explanation if useful.
- Contact information.
- Links to app entry points when available.

Invite pages should not perform privileged redemption. They can display a link or direct users to the app. The app and backend own redemption.

The site should avoid dark patterns, excessive marketing language, or claims that exceed current product reality. It should be honest about early-stage status.

## 63. Product Language

Product language needs discipline. "Anonymous" should mean anonymous to ordinary community readers, not anonymous to the backend. "Owner" can remain a database role, but product language may move toward "host" when describing temporary school control. "Admin" should be reserved for platform-level operators. "Moderator" should mean scoped content operator. "Member" should mean a user with community access. "Applicant" should mean a user requesting school entry.

The app should avoid mixing these terms. If a button says host, the underlying action should still map clearly to owner permissions. If a screen says admin, it should require platform admin. If a flow says invite, it should distinguish member invite from moderator invite.

Clear language reduces support, avoids user confusion, and makes backend rules easier to reason about.

## 64. UX Priorities

The UX priority is clarity over polish. Users need to know:

- Which Epsu they are in.
- Whether they can post.
- Whether they can reply.
- Whether they already reacted.
- Whether they already reported.
- Whether they are active, invited, muted, kicked, or not joined.
- Whether a school requires application.
- Whether a post was removed.
- Whether an action succeeded.

The app should provide strong empty states. Empty Epsus are likely during launch. An empty feed should not feel broken. It should explain the next useful action: post, apply, join, suggest, or wait for approval.

Buttons should not appear available when backend rules will certainly reject the action. But backend rejection must still be handled because local state can be stale.

## 65. School UX

School UX must make application status clear. A user should understand whether they can apply, have already applied, are invited, are active, were rejected, or were kicked. Owners should understand which applications are pending and what action is needed.

School creation should guide the creator through name, website, country, and logo. If logo upload fails, the app should not create a broken school. If school creation fails after upload, cleanup should remove the uploaded logo where possible.

Admin approval should be visible enough to avoid confusion. A creator should not assume a pending school is public. If a pending school is rejected, the notification should explain the result without exposing internal admin notes unless those notes are intentionally supported.

## 66. Moderation UX

Moderation UX should minimize cognitive load. Moderators need the reported content, report reason, context, and action buttons. They do not need every possible user history detail in the first view. Deeper history can come later.

Actions should be clearly separated:

- Dismiss report means no action on the post.
- Remove post means content is hidden or marked removed.
- Mute author means temporary participation restriction.

The app should avoid accidental destructive actions. Remove, mute, kick, and delete should require clear intent. However, moderation should not be so slow that reports pile up.

Worst-user ranking should be treated as a signal, not a verdict. It can highlight repeated reports, but humans should review context.

## 67. Admin UX

Admin UX should surface pending work first. Pending school Epsus, regional suggestions, open account requests, failed push delivery, and operational alerts are more important than static charts. Admin screens should be dense, readable, and action-oriented.

Admin push delivery should show what happened: sent count, notification count, disabled tokens, receipt failures, and errors. Eventually it should become scheduled, but manual admin delivery is acceptable during soft launch.

Admin review flows should refresh after actions. An approved school should disappear from pending. A rejected suggestion should disappear from suggestions. Errors should show specific messages when safe.

## 68. Support UX

Support should be reachable, but the app should reduce support need by making state understandable. Account history helps. Correction requests help. Clear application status helps. Clear error messages help.

Future support screens may include:

- My requests.
- Request status.
- Contact support.
- Report a technical issue.
- Appeal moderation action.

These should be added only when support demand proves the need. For launch, a monitored email and correction request flow are enough if they are actually checked.

## 69. Data Minimization

Data minimization should be practical. Collect what the product needs now. Avoid speculative collection. Birth date exists for age gate. Country exists for regional membership. Email exists for auth. Username exists for profile identity. Push token exists for delivery. School application answer exists for owner review.

Do not collect exact location unless a later regional model truly needs it. Do not collect student ID unless school email or other lighter verification fails. Do not send sensitive content to analytics. Do not store unnecessary support data inside app tables.

Minimal data makes security, deletion, support, and trust easier.

## 70. Retention Strategy

Retention will not come from notifications alone. Users return when there is local content worth checking. The retention strategy is:

- Pick communities with real shared context.
- Seed first posts.
- Make posting low-friction.
- Make replies visible.
- Notify users about meaningful updates.
- Keep moderation from ruining trust.
- Give hosts enough tools to keep communities alive.

Day-one return tests whether first experience was understandable or interesting. Day-seven return tests whether community value exists. A user who signs up once and never returns is not a success.

Retention should be analyzed by Epsu, not only globally. One successful school can be hidden by three dead launch communities if only global averages are reviewed.

## 71. Growth Strategy

Growth should be local and sequential. Do not open every school. Do not approve every regional suggestion. Do not market nationally. Instead, launch where someone can seed and support usage.

Growth sequence:

- Prove one school.
- Add nearby or similar schools.
- Prove one regional Epsu.
- Add regions with clear demand.
- Add hosts only where activity exists.
- Add monetization only where governance works.

This strategy avoids empty expansion. Epsu should grow through active nodes, not a blank map.

## 72. Community Seeding

A community needs a first reason to post. Seed content should be real, local, and lightweight. It should not feel corporate. Good seed prompts might be about school life, local events, campus complaints, practical questions, or anonymous observations. Bad seed content is generic engagement bait that could apply anywhere.

Seed users should understand the app's purpose. They do not need formal roles unless they are hosts or moderators. They need to post enough that the first visitors see life.

Seeding should be tracked. Which seed posts got replies? Which got reactions? Which communities stayed quiet? The answer should influence expansion.

## 73. Governance Philosophy

Governance should be layered. Users report. Moderators act on reports. Owners or hosts manage community access. Admins review communities and intervene. Backend logs preserve action history.

The product should avoid both extremes: no governance and overbearing centralized control. Local hosts need enough power to keep spaces alive. Platform admins need enough authority to prevent abuse, remove bad hosts, and protect users.

Governance quality should be judged by outcomes: reports resolved, abuse contained, hosts behaving, users returning, and disputes handled.

## 74. Host Performance

Host performance should eventually be measured. Possible indicators:

- Application response time.
- Number of active members.
- Posts per week.
- Reports per week.
- Report resolution time.
- Moderator appointments.
- Complaints about host.
- Inactivity duration.
- Successful handoff.

These metrics should not automatically remove hosts at first. They should inform admin review. Automatic removal can come later only when rules are mature.

## 75. Moderator Performance

Moderator performance should be measured by action quality, not raw action count. A moderator who removes many posts may be diligent or abusive. A moderator who dismisses all reports may be calm or negligent.

Useful indicators:

- Actions taken.
- Report resolution time.
- Removal-to-dismiss ratio.
- Mute count.
- Reversed actions if appeals exist.
- Complaints.
- Activity coverage.

Moderator records should support owner and admin review. They should not become public scoreboards.

## 76. Abuse Scenarios

Likely abuse scenarios:

- Brigading dislikes to remove posts.
- False reports against a user.
- Host rejecting applicants unfairly.
- Moderator removing posts for personal reasons.
- Users creating many suggestions.
- Users attempting to redeem expired invites.
- Public callers trying to trigger push delivery.
- Users uploading inappropriate school logos.
- Users creating misleading school names.
- Users trying to access school content without membership.

Mitigations include backend authorization, logs, rate limits where needed, admin review, report thresholds, manual launch monitoring, and conservative expansion.

## 77. Rate Limits

Rate limits are not the first launch feature, but they will become important. Candidate limits:

- Signup attempts.
- Password reset requests.
- Post submissions per time window.
- Reports per user per time window.
- Suggestions per user per time window.
- Invite generation per owner.
- Push delivery invocation.
- Logo uploads.

Some limits can live in Supabase/Auth/provider settings. Others may need database checks. Rate limits should be added when abuse risk appears or before public scale.

## 78. Search and Discovery

Discovery should stay simple. Users need to find relevant Epsus, not browse an infinite directory. Search can eventually support school name, city, country, and suggested regions. Discovery should respect review status and access rules.

The app should avoid recommending private or pending Epsus to normal users. It should distinguish joinable, apply-required, already joined, invited, muted, and unavailable communities.

Discovery metrics should track searches, no-result searches, suggestion creation after search, and joins/applications after discovery.

## 79. Internationalization

The current product can launch in English first, but country and school models imply international use. Internationalization should not be rushed, but text should avoid hard-coded assumptions where easy. Country codes should be normalized. School names should preserve characters where possible. Slugs can normalize for URL/storage safety while display names keep original form.

Future localization should start only where launch demand exists. Translating a product with no active community is premature.

## 80. Accessibility

Accessibility should be practical. Buttons need readable labels. Text needs sufficient contrast. Input errors need clear messages. Touch targets need usable size. Screens should not rely only on color to show state. Loading and disabled states should be understandable.

Accessibility matters especially for reports, account settings, deletion, and school applications because mistakes there are high-impact. It is acceptable to improve iteratively, but avoid obvious barriers.

## 81. Performance

Performance risks are most likely in boot hydration, feed loading, repeated membership queries, report joins, and population counts. Early launch volume is small, but query patterns should not assume infinite client memory.

Performance actions:

- Add pagination to posts when needed.
- Batch population count fetches.
- Avoid loading all reports globally.
- Scope membership queries.
- Cache stable Epsu metadata.
- Keep image sizes small.
- Avoid unnecessary app-wide refreshes.

Performance should be measured before major rewrites.

## 82. Consistency

Consistency matters after writes. After posting, local state should include the returned saved post. After reacting, counts should match backend result. After reporting, reported IDs should update. After moderation, the report should leave the queue. After school approval, Epsu lists should refresh. After role changes, memberships should refresh.

Optimistic updates are acceptable for low-risk actions, but high-impact actions should prefer server-confirmed state. Delete, kick, approve, reject, mute, and role change should rely on backend result and refresh relevant state.

The product should avoid local-only authority. If local state says the user is an owner but backend says no, backend wins.

## 83. Error Messages

Error messages should be direct. Examples:

- "Join this Epsu before posting."
- "You have been muted here."
- "This invite is no longer valid."
- "Owner access required."
- "Admin access required."
- "School logo required."
- "You already applied to this Epsu."
- "You are already in this Epsu."

Raw database errors should be translated when shown to users. Admins can see more detail, but secrets and tokens should never be exposed.

## 84. Build and Release

The release sequence should be:

- Check git status.
- Run lint.
- Review changed files.
- Apply migrations.
- Deploy Edge Functions.
- Verify live backend behavior.
- Build app.
- Test on device.
- Update launch notes.
- Release to target group.

Different changes have different rollback paths. UI changes can be patched with app updates. Edge Function bugs can be redeployed. Database migrations may require repair migrations. Secret leaks require rotation. Build failures require EAS investigation.

## 85. Environment Configuration

Client environment should include only public Supabase URL and publishable anon key. Function environment should include service role key through Supabase runtime and private secrets such as push delivery secret. Local `.env` should not include service credentials that could ship to the app.

Configuration should be documented:

- Expo project ID.
- App scheme.
- Supabase project ref.
- Supabase URL.
- Publishable key.
- Edge Function names.
- Storage bucket names.
- Static site host.
- Domain.

Missing config should fail clearly.

## 86. App Store Direction

App store readiness should focus on working account flows, support contact, privacy consistency, notification permission explanation, age handling, and stable builds. Screenshots and descriptions should match actual behavior. Do not claim mature monetization, verified schools, or broad availability before those exist.

The app should be tested through development builds before external release. Push notifications require proper Expo configuration and native rebuilds when notification modules change.

App store review may ask about user-generated content, moderation, reporting, blocking/muting, and account deletion. The product should be ready operationally, not just textually.

## 88. Technical Debt

Technical debt should be categorized:

- Stale helpers.
- Large orchestration files.
- Direct table writes.
- Missing tests.
- Unpaginated queries.
- Manual admin operations.
- Incomplete analytics.
- Sparse error handling.
- Historical docs out of date.

Not all debt must be paid before launch. Pay debt that risks account integrity, authorization, moderation, posting, or support. Defer aesthetic debt and broad refactors until after launch evidence.

## 89. Stale Code Policy

Stale code should be removed when it conflicts with current backend contracts or creates wrong mental models. Dead helpers that call old RPC signatures are dangerous. Prototype seed functions that write environment-shaping data from the client are dangerous. Old auth storage shims or template components can be removed if unused.

Before removing, search for references. After removing, run lint. If a stale function is kept for future reference, document why. Otherwise delete it.

## 90. Backlog Priority

Highest priority:

- Test invite redemption live.
- Test school logo upload live.
- Rotate exposed CLI token.
- Add admin account request queue.
- Add failed push delivery visibility.
- Add backend negative tests.
- Test account deletion edge cases.

Medium priority:

- Add PostHog.
- Add Metabase.
- Add host dashboard.
- Add feed pagination.
- Add school email verification.
- Add suggestion clustering.
- Add better empty states.

Low priority:

- Regional ads.
- Paid host tools.
- Third-party ads.
- Public profiles.
- Complex discovery.
- Large custom backend.

## 91. Decisions to Delay

Delay company registration until formal need. Delay paid hosts until school activity exists. Delay regional hosts until regional activity exists. Delay ad networks indefinitely unless direct ads fail and user experience can survive ads. Delay custom backend until Supabase is insufficient. Delay exact residency verification until disputes require it. Delay broad launch until one community works.

Delayed decisions need triggers. Without triggers, delay becomes avoidance. With triggers, delay is discipline.

## 92. Success Definition

Success at this stage is one or more local communities that return, post, reply, react, and report at manageable levels. Technical success means backend authority is enforced and account flows are stable. Operational success means reports, support, reviews, and notifications can be handled. Business success means the team learns whether school or regional host models have any basis.

The first success does not require revenue. It requires proof of repeat local utility.

## 93. Failure Definition

Failure signals:

- Users sign up but do not post.
- Users post once and never return.
- Reports overwhelm moderators.
- Hosts do not review applications.
- School applicants do not understand status.
- Feed feels empty everywhere.
- Support issues are ignored.
- Authorization bugs appear.
- Push notifications annoy users without improving return.
- Expansion happens before retention.

Failure should lead to diagnosis, not denial. A failed school can still teach which school type to avoid.

## 94. Immediate Next Steps

Immediate steps:

- Verify the live hardening changes.
- Rotate the exposed Supabase token.
- Run end-to-end manual tests.
- Pick three schools.
- Pick one regional Epsu.
- Identify seed participants.
- Prepare launch issue list.
- Prepare daily metrics sheet.
- Monitor support inbox.
- Test admin push delivery as an admin.
- Test unauthorized push delivery remains blocked.
- Test new school logo path.
- Test invite redemption.

These are more important than new feature ideas.

## 95. Operating Cadence

During launch week:

- Daily backend check.
- Daily support check.
- Daily metrics snapshot.
- Daily moderation review.
- Daily bug triage.

After launch week:

- Weekly metrics review.
- Weekly roadmap adjustment.
- Weekly open reports review.
- Weekly support review.
- Weekly cost review.

The cadence should be lightweight. The goal is not meetings. The goal is not missing obvious signals.

## 96. Expansion Criteria

Approve or launch a new Epsu only when at least one of these is true:

- Multiple users requested it.
- A seed participant is ready.
- A school host candidate exists.
- It is strategically needed for a launch cohort.
- It is low-risk and easy to moderate.

Do not expand because a place exists. Places are infinite. Operational attention is not.

## 97. Host Dashboard Direction

A host dashboard should show only local metrics:

- Active members.
- Pending applications.
- Posts this week.
- Replies this week.
- Reports open.
- Reports resolved.
- Average application response time.
- Recent moderation actions.
- Notification or announcement tools only if later justified.

Hosts should not see cross-Epsu data. They should not see sensitive user information beyond what their role requires.

## 98. Admin Dashboard Direction

Admin dashboards should show:

- Global active users.
- Active Epsus.
- Dead Epsus.
- Pending schools.
- Pending suggestions.
- Open account requests.
- Open reports by age.
- Push delivery failures.
- Storage upload failures.
- New users by day.
- Day-one and day-seven return.

Admin dashboards support operational decisions. They are not investor slides.

## 99. Future Backend Jobs

Future scheduled jobs:

- Deliver pending push notifications.
- Check push receipts.
- Clear stale presence.
- Purge expired personal data.
- Disable stale push tokens.
- Detect old pending applications.
- Detect inactive hosts.
- Detect open reports older than threshold.
- Cleanup orphaned logo uploads.

Jobs should be idempotent and observable. A job should be safe to retry.

## 100. Final Principle

Epsu should become real by being small, governed, and measurable. The product should resist the temptation to look big before one local community works. It should also resist the temptation to stay a prototype after users trust it with accounts, posts, applications, reports, and notifications.

The path is clear: harden the backend, launch narrowly, measure honestly, improve governance, then monetize only where real activity and trust exist.

## 101. System Contracts

Every major Epsu flow should have an explicit contract. A contract is not legal wording. It is a product and engineering agreement about inputs, checks, side effects, and result shape.

Post contract: input is Epsu ID, title, body, optional reply target, and authenticated user. Checks are auth, membership, mute state, Epsu visibility, title/body validity, and reply scope. Side effects are new post, number assignment, possible notification record, and local state refresh. Result is saved post JSON.

Reaction contract: input is post ID, reaction, and authenticated user. Checks are auth, post active, feed access, no duplicate reaction, and valid reaction type. Side effects are reaction insert and count update. Result is duplicate status or updated counts.

Report contract: input is post ID, reason, optional explanation, and authenticated user. Checks are auth, post active, feed access, no duplicate report, and valid reason. Side effects are report insert and moderation queue visibility. Result is report record or duplicate result.

Application contract: input is school Epsu ID, answer, and authenticated user. Checks are auth, Epsu is school, answer length, not kicked, not active, not already applied. Side effects are pending application. Result is application ID and status.

Review contract: input is application ID, status, and owner user. Checks are auth, valid status, application exists, Epsu exists, caller is owner. Side effects are application update, membership update if approved, moderation action, and possible notification. Result is status JSON.

Invite contract: input is Epsu ID and invite role. Checks are auth, caller is owner, role valid. Side effects are active token creation or retrieval, moderation log. Result is token and role.

Redeem contract: input is invite token and authenticated user. Checks are auth, token exists, token active, uses remain. Side effects are membership upsert, invite use count increment, invite deactivation if exhausted, moderation log. Result is role, status, and message.

Push delivery contract: input is admin call or secret-backed job call. Checks are platform admin or delivery secret. Side effects are Expo send, ticket storage, token disabling where needed, receipt checks for older tickets. Result is counts and errors.

These contracts should drive tests and future refactors.

## 102. Database Index Plan

Indexing should follow query behavior. Early useful indexes include memberships by profile and status, memberships by Epsu and role, posts by Epsu/status/number, reports by status and post, reports by reporter/post, applications by Epsu/status, notifications by profile/read state, push tokens by profile/enabled, suggestions by country/title/status, invites by token, invites by Epsu/role/active, presence by Epsu/profile, and moderation actions by Epsu/created time.

Indexes should not be added blindly. Each index speeds reads but costs writes and storage. The first launch likely does not need complex indexing beyond obvious joins and uniqueness. After launch, slow query logs and dashboard load times should decide additional indexes.

Unique constraints are not only performance tools. They enforce product truth. A user should not report the same post twice. A user should not have duplicate membership rows for the same Epsu. An invite token must be unique. A push token should not duplicate for the same profile.

## 103. Migration Discipline

Migrations should be reviewed like code. Each migration should answer what it changes, whether it is safe to run once, whether it is safe to run again, whether it changes existing data, whether it affects RLS, and how failure would be repaired.

Migration types:

- Schema add: new table, column, constraint, or index.
- Policy change: RLS enablement or policy replacement.
- RPC change: create or replace function.
- Data repair: update existing records.
- Storage policy change.
- Cleanup: dropping stale policies or constraints.

Data repair migrations should be especially explicit. They can silently change production state. If a migration deletes or updates user data, record why.

For the current stage, using the Supabase API to apply SQL is acceptable, but the source migration file must remain in the repo so the live state can be reconstructed.

## 104. Manual SQL Policy

Manual SQL should be minimized but not forbidden. During early launch, manual SQL can answer urgent questions and repair broken prototype data. The rule is that manual SQL must be recorded if it changes data or security. Read-only manual SQL can be used for investigation.

Safe manual SQL examples:

- Count users.
- List pending schools.
- Inspect open reports.
- Check policy existence.
- Verify function signatures.
- Count push errors.

Dangerous manual SQL examples:

- Deleting users.
- Updating memberships.
- Changing admin flags.
- Disabling RLS.
- Editing posts.
- Marking reports resolved.
- Updating invites.

If dangerous manual SQL is necessary, save the query, reason, timestamp, expected effect, and verification result.

## 105. Launch Data Sheet

Before analytics tooling exists, use a simple daily launch data sheet. Columns should include date, total users, new users, active users, active users by launch Epsu, posts by Epsu, replies by Epsu, reports by Epsu, open reports, resolved reports, school applications, application approvals, application rejections, suggestions, notification opt-ins, push sends, support issues, major bugs, and notes.

The sheet should also track qualitative observations:

- Which posts got replies.
- Which empty states confused users.
- Which school had no activity.
- Which users asked for help.
- Which moderation issue appeared.
- Which feature was requested repeatedly.

Manual tracking is enough for the first launch if it is done daily and honestly.

## 106. User Interview Plan

After soft launch, talk to a small number of users. Do not ask only whether they like the app. Ask what they thought the app was for, whether they understood Epsus, whether they trusted anonymity, whether they knew where to post, whether they saw anything worth returning for, whether they would invite a friend, and what stopped them from posting.

For hosts or school creators, ask whether application review made sense, whether member tools were clear, whether they felt responsible for moderation, and what information they wanted about their school Epsu.

For moderators, ask whether reports had enough context, whether actions were clear, whether anything felt risky, and whether records helped.

Interview findings should be tied back to metrics. If users say onboarding is confusing and signup-to-first-post is low, the evidence aligns.

## 107. Community Health Model

Community health should be evaluated per Epsu. A healthy Epsu has repeat visitors, new posts, replies, manageable reports, responsive moderation, and clear membership flow. An unhealthy Epsu may be empty, hostile, spammed, over-moderated, under-moderated, or blocked by inactive hosts.

Health categories:

- Seed: created but needs first activity.
- Emerging: some posts and users, not yet stable.
- Active: repeat participation exists.
- At-risk: reports, inactivity, or host issues threaten usefulness.
- Dormant: no meaningful activity.
- Closed or hidden: no longer part of normal product surface.

Admin dashboards should eventually classify Epsus using these categories. Early classification can be manual.

## 108. School Selection Criteria

Not every school is a good launch candidate. A school should be selected if it has at least one seed user, a plausible host or owner, manageable size, accessible student network, and likely topics that users care about. A school should be avoided if there is no seed user, no way to reach students, high risk of immediate abuse, or no one willing to moderate.

Ideal early schools:

- Small enough that local context matters.
- Large enough that multiple users can participate.
- Has a student willing to seed and monitor.
- Has existing informal communication gaps.
- Has low institutional friction.

The goal is not prestige. The goal is repeat local use.

## 109. Regional Selection Criteria

A regional Epsu should be selected if it has a clear local identity and at least one distribution path. A national Epsu can work as a broad fallback, but city or town Epsus need seed activity. Large cities may be too broad; districts may be better.

Good regional candidates:

- Specific town or district.
- Active local youth or student community.
- Existing local issues people discuss.
- Small enough to feel shared.
- Low moderation risk for initial launch.

Poor candidates:

- Huge city with no seed plan.
- Region chosen only because it is famous.
- Region with no reachable users.
- Region likely to produce political conflict before moderation is ready.

## 110. Content Strategy

Epsu should not script user content, but it can seed prompts. Good content prompts are local, specific, and low-pressure. Examples include school cafeteria opinions, event questions, campus tips, local transport complaints, anonymous advice, club discovery, study stress, housing questions, or neighborhood observations.

Bad prompts are generic engagement bait, polarizing questions before moderation maturity, or content that encourages harassment.

Content strategy should focus on making the first post easier. Once users post naturally, artificial prompts should fade.

## 111. Moderation Escalation

Some issues should escalate beyond local moderators. Escalation triggers include host abuse, moderator abuse, repeated harmful content, credible safety concerns, account misuse, cross-Epsu harassment, and content that local moderators cannot judge fairly.

Escalation path:

- User report creates local queue item.
- Moderator or owner acts if within scope.
- Admin reviews if local action is disputed or severe.
- Admin can change roles, remove content, disable Epsu, or contact support path.

The product does not need a full appeals court at launch, but it needs a way to handle obvious local governance failure.

## 112. Role Change Rules

Role changes should be rare and logged. Owners can promote members to moderators and demote moderators to members. Owners should not be able to demote themselves through ordinary role management. Owner transfer should be a separate future function. Admins may need override tools later.

Kicking should be restricted. School owners may kick members where supported. Kicked users should not rejoin through normal application. The system should record who kicked whom, from which Epsu, and why if reason fields are added later.

Leaving should be allowed for ordinary school members where product rules permit. Owners should not leave without transfer or deletion because orphaned ownership creates operational problems.

## 113. Notification Types

Notification kinds should remain controlled. Useful early kinds include school review result, school application result, flagged post alert for moderators, invite-related status, account-related notice, and system notice. Each kind should define recipient, trigger, title, body, read behavior, push eligibility, and whether it should be delivered immediately or batched.

Not every in-app notification should become a push notification. Push should be reserved for meaningful events. Too many pushes will cause opt-out and reduce trust.

Notification preference should eventually become per-kind. Early global on/off is enough.

## 114. Push Scheduling

Manual admin push delivery works for early launch. Scheduled delivery should be added later with a secure secret. The schedule should be conservative: frequent enough to be useful, not so frequent that it creates noise or operational cost. A simple interval job can call the Edge Function with `x-epsu-push-secret`.

Delivery should be idempotent by checking `push_sent_at`. Receipt checks should wait long enough for Expo receipts to become meaningful. Failed receipts should be recorded, not retried blindly forever.

If push delivery fails, in-app notifications should still exist.

## 115. Account Deletion Edge Cases

Deletion edge cases:

- User owns an approved school.
- User owns a pending school.
- User is moderator in multiple Epsus.
- User has open reports.
- User has reports against their posts.
- User has pending applications.
- User has push tokens.
- User has notifications.
- User has account requests.
- User authored posts with replies.

The deletion function should define what happens in each case. Some records can be deleted. Some should be anonymized. Some may need preservation for moderation integrity. The app should sign out after deletion and clear local state.

## 116. Epsu Deletion Edge Cases

Epsu deletion is high-impact. It removes a community and cascades dependent records. Only an owner or admin-level process should do it. Deletion should log the action before deleting. If a logo exists, storage cleanup should run. If cleanup fails, the database deletion should still be considered carefully because orphaned files are less serious than failed community deletion, but the orphan should be tracked.

Future deletion may need soft-delete rather than hard delete, especially once communities have monetization or audit requirements. For launch, hard delete by owner may be acceptable for prototype-created Epsus, but approved active communities should require more caution.

## 117. Suggestion Review

Regional suggestion review should consider demand, clarity, duplication, country, and operational capacity. Approving a suggestion creates a new Epsu, which creates moderation and discovery obligations. Rejection should mark the suggestion without deleting history.

Review questions:

- Is the title a real place or usable region?
- Is country known?
- Are there multiple requests?
- Is there seed activity?
- Is there moderation capacity?
- Does a similar Epsu already exist?

Suggestions should help decide expansion, not pressure admins into approving everything.

## 118. School Review

School review should check name, website, logo, country, creator, and plausibility. Approval should make the school visible and notify the creator. Rejection should notify the creator. Owner membership should be active where appropriate.

Admin review should be quick but not careless. Fake schools, misleading logos, invalid websites, or obvious abuse should be rejected. If uncertainty is common, add a review notes field later.

School approval creates a community, not just a row. That means someone should be ready to handle applications and moderation.

## 119. Future Verification

Verification should be progressive. Start with self-declared country and admin-reviewed school website/logo. Add school email verification for host legitimacy. Add optional student proof only when needed. Add regional proof only for paid hosts or disputes. Avoid collecting documents before there is a clear use.

Verification should be tied to privilege. A normal member may need little proof. A school host may need more. A paid regional host may need more still. Admins need secure internal control.

Verification data should be minimized and deleted when no longer needed.

## 120. Final Execution Order

The fastest safe path is:

1. Finish hardening already started.
2. Rotate exposed secrets.
3. Test launch-critical flows.
4. Pick launch communities.
5. Seed first posts.
6. Launch quietly.
7. Record daily metrics.
8. Fix blockers.
9. Interview early users.
10. Decide whether to continue, pivot, or pause.
11. Add analytics.
12. Improve governance.
13. Test monetization only after activity.

This order protects the product from premature scaling and protects users from prototype shortcuts.

## 121. Pre-Launch Verification Matrix

The final pre-launch check should be written as a matrix, not handled from memory. Each row should have flow, account role, expected result, backend object touched, failure mode, and owner. The minimum matrix should include unauthenticated user, normal member, invited member, muted member, kicked member, school applicant, school owner, moderator, platform admin, and deleted account scenario.

Required verification rows:

- Unauthenticated user opens app and sees auth screens.
- New user signs up and receives profile.
- New user logs in after verification path if needed.
- User updates country and receives regional membership.
- User opens regional Epsu and sees feed.
- User joins public regional Epsu.
- User creates post.
- User creates reply.
- User reacts once.
- User cannot react twice if duplicate prevention is active.
- User reports post.
- Duplicate report is blocked or handled.
- Moderator sees open report.
- Moderator dismisses report.
- Moderator removes post.
- Moderator mutes author.
- Muted author cannot post.
- Owner sees school applications.
- Owner approves school application.
- Owner rejects school application.
- Owner creates member invite.
- Owner creates moderator invite.
- User redeems member invite.
- User redeems moderator invite.
- Expired invite fails.
- Normal user cannot generate owner invite.
- Normal user cannot call admin review.
- Normal user cannot deliver push queue.
- Admin can deliver push queue.
- Public push call returns unauthorized.
- School creator uploads logo.
- Other user cannot delete that logo through normal policy.
- User opens account history.
- User sends correction request.
- User deletes account.

This matrix is more valuable than a vague statement that the app was tested.

## 122. Post-Launch Review Template

After the first launch week, write a review with these sections:

- What launched.
- Which Epsus were included.
- How many users joined.
- How many returned after day one.
- How many returned after day seven.
- How many posts were created.
- How many replies were created.
- How many reports were submitted.
- How many reports were resolved.
- Which flows failed.
- Which support issues repeated.
- Which users gave useful feedback.
- Which school had the strongest signal.
- Which community should be paused.
- Which feature request appeared more than once.
- Which backend issue needs priority.
- Whether monetization remains premature.
- Whether company setup remains premature.
- Whether analytics should now be added.

The review should produce decisions, not just observations. A decision can be continue, stop, narrow, expand, fix, or delay.

## 123. Decision Ledger

Epsu should keep a decision ledger. Each major decision should include date, decision, context, alternatives, reason, expected impact, review date, and result. This is useful because early products change direction quickly and memory becomes unreliable.

Examples of decisions worth recording:

- Why a school was selected for launch.
- Why a regional Epsu was approved.
- Why a host was appointed or removed.
- Why monetization was delayed.
- Why a backend function was changed.
- Why a policy was hardened.
- Why an analytics tool was added.
- Why a feature was cut.

The ledger does not need to be formal. A markdown file is enough. The value is continuity.

## 124. Evidence Thresholds

The product should define thresholds before interpreting results. Suggested early thresholds:

- At least one launch Epsu has repeat activity across seven days.
- At least one school produces more than one poster.
- At least one post receives replies, not only reactions.
- Report volume is low enough to handle manually.
- No critical account bug appears.
- At least a small fraction of users return after day one.
- At least some users understand school application flow without direct help.

These thresholds are not permanent KPIs. They are early evidence gates. If none are met, the next step should be diagnosis, not expansion.

## 125. Anti-Goals

Epsu should explicitly reject several paths during the current stage:

- Do not build a global viral feed.
- Do not approve every suggested place.
- Do not sell regional ads before regional retention.
- Do not sell school hosting before host governance.
- Do not add document verification before it is needed.
- Do not collect exact location for convenience.
- Do not add complex company structure before obligations exist.
- Do not replace Supabase just because a custom backend sounds mature.
- Do not treat legal pages as product validation.

Anti-goals are useful because they protect focus.

## 126. Founder Operating Notes

The founder should spend most early energy on three things: making the product reliable, getting real users into a few communities, and learning from actual behavior. Time spent polishing documents, imagining large-scale monetization, or building broad infrastructure should be limited unless it directly supports those three things.

Useful daily questions:

- Did anyone new use Epsu today?
- Did anyone return?
- Did anyone post?
- Did anyone reply?
- Did anyone report?
- Did any flow fail?
- Did any user ask for help?
- Did any community feel alive?

If the answer to all activity questions is no, the problem is not missing monetization. The problem is distribution, onboarding, or product value.

## 127. Closing Summary

The masterplan is intentionally practical. Epsu should become a trustworthy local anonymous community system by tightening backend authority, launching narrowly, measuring honestly, and delaying monetization until governance and activity exist. Schools are the strongest early wedge. Regional Epsus are useful but should expand carefully. Hosts and moderators can create value only if their powers are scoped and logged. Admins need operational tools, not vanity dashboards. Supabase remains a strong backend choice if RLS, RPCs, Storage policies, and Edge Functions are used consistently.

The next best move is not to write more theory. It is to test the hardened app end to end, rotate exposed secrets, select the launch communities, seed first posts, and watch whether anyone comes back.
