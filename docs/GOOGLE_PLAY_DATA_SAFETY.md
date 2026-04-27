# Google Play Data Safety Draft

Working draft for the Play Console Data Safety form, based on the current codebase as of April 20, 2026.

## Data collected

### Personal info
- Email address

### App activity
- In-app actions such as reactions, reports, notification preference changes, membership actions, and moderation actions tied to the account

### User-generated content
- Posts
- Replies
- Reports
- School application answers
- Epsu suggestions
- Uploaded school logos
- Account correction requests

### App info and performance
- No dedicated analytics or crash-reporting SDK is currently implemented in the app code

### Device or other IDs
- Push token
- Account identifier / profile ID used by the backend

### Other personal info
- Username
- Date of birth
- Country code
- Terms / policy acceptance timestamps

## Collection vs sharing
- Collected: yes
- Shared with third parties for their own purposes: no
- Processed by service providers on the developer’s behalf: yes
  - Supabase
  - Expo notification infrastructure
  - Render for the public site

## Purposes
- App functionality
- Account management
- Security and fraud prevention
- Moderation and abuse handling
- Notifications

## Security and deletion
- Data is transmitted over the app/backend infrastructure
- Users can request account deletion in-app
- Users can also request deletion externally via the public account deletion page

## Permissions reflected in the app
- Notifications
- Photos / media library access only for optional school logo upload

## Important store-policy note
Google Play’s UGC policy expects in-app reporting and blocking functionality. The app clearly has in-app reporting. This document does not claim blocking because that is not clearly implemented in the current code.
