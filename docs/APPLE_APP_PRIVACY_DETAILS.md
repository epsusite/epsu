# Apple App Privacy Details Draft

Use this as the working draft for App Store Connect. It is based on the current codebase as of April 20, 2026.

## Data collected

### Contact Info
- Email address
  - Purpose: account creation, login, password reset, account management
  - Linked to user: yes
  - Used for tracking: no

### User Content
- Posts and replies
  - Purpose: app functionality, moderation
  - Linked to user: yes at the backend while the account exists
  - Used for tracking: no
- Reports
  - Purpose: moderation, safety
  - Linked to user: yes
  - Used for tracking: no
- Epsu suggestions
  - Purpose: app functionality
  - Linked to user: yes
  - Used for tracking: no
- Uploaded school logos
  - Purpose: app functionality
  - Linked to user: yes
  - Used for tracking: no

### Identifiers
- User ID / account identifier
  - Purpose: account functionality, security, moderation
  - Linked to user: yes
  - Used for tracking: no
- Push token
  - Purpose: notifications
  - Linked to user: yes
  - Used for tracking: no

### Sensitive or account-related data
- Date of birth
  - Purpose: age-gating and account eligibility
  - Linked to user: yes
  - Used for tracking: no
- Country
  - Purpose: community visibility and signup profile data
  - Linked to user: yes
  - Used for tracking: no

### Product interaction / service data
- Memberships, reactions, notification preferences, moderation actions, invite redemptions
  - Purpose: app functionality, moderation, security
  - Linked to user: yes
  - Used for tracking: no

## Data not currently claimed
- No analytics SDK is present in the app
- No advertising SDK is present in the app
- No location permission is requested
- No contacts access
- No microphone access
- No camera access

## Permissions reflected in the app
- Notifications: optional, only when user enables them
- Photo library: requested only when user chooses a school logo to upload

## Internal note
Apple’s taxonomy can force some of the above into slightly different buckets in App Store Connect. This draft is the factual source list, not the final UI wording.
