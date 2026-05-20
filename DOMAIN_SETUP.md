## epsu.site setup

### App code
- Public site base: `https://epsu.site`
- Legal docs:
  - `https://epsu.site/terms`
  - `https://epsu.site/guidelines`
  - `https://epsu.site/privacy`
- Auth landing pages:
  - `https://epsu.site/auth-confirm.html`
  - `https://epsu.site/reset-password.html`
- Universal link verification files:
  - `https://epsu.site/.well-known/assetlinks.json`
  - `https://epsu.site/.well-known/apple-app-site-association`
- Owner invite links:
  - `https://epsu.site/join/<epsu-slug>`
  - `https://epsu.site/mod/<epsu-slug>`

### Expo app config
- `app.json` now declares:
  - iOS associated domain: `applinks:epsu.site`
  - Android App Links for:
    - `/auth/confirm`
    - `/reset-password`
    - `/join`
    - `/mod`
- Rebuild the native app after these changes. Existing installed builds will not pick up the new universal-link entitlements.

### Supabase
Set these in `Authentication -> URL Configuration`:
- `Site URL`: `https://epsu.site`
- add redirect URLs:
  - `https://epsu.site/auth-confirm.html`
  - `https://epsu.site/reset-password.html`
- if the confirmation email template still uses `{{ .SiteURL }}`, update it to use `{{ .RedirectTo }}` for auth links so `emailRedirectTo` is honored

### DNS / hosting
Point `epsu.site` to your web host / landing page provider, then serve the legal pages and invite landing pages from that domain.

### Values you still must replace
- In `site/.well-known/assetlinks.json`, replace `REPLACE_WITH_RELEASE_SHA256_CERT_FINGERPRINT` with the SHA-256 certificate fingerprint of the Android signing key used for your release build.
- In `site/.well-known/apple-app-site-association`, replace `REPLACE_WITH_APPLE_TEAM_ID` with your Apple Developer Team ID.

### Where to get them
- Android release SHA-256:
  - If using EAS managed credentials, get the Android signing certificate fingerprint from Expo/EAS credentials or Google Play App Integrity / App Signing depending on your release setup.
  - If using your own keystore, run `keytool -list -v -keystore <your-keystore> -alias <alias>` and copy the `SHA256` fingerprint.
- Apple Team ID:
  - Apple Developer account -> Membership.
  - Or the team identifier shown in App Store Connect / Apple Developer Console for the account that owns `com.jtruu.epsu`.
