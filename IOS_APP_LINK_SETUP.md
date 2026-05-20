# iPhone App Link Setup

This is the remaining iPhone setup needed so `https://epsu.site/...` links can open Epsu directly on iPhone instead of falling back to the website.

## 1. Apple Team ID

You must replace the placeholder in:

- [site/.well-known/apple-app-site-association](C:/Users/jtruu/epsu/site/.well-known/apple-app-site-association)

Replace:

- `REPLACE_WITH_APPLE_TEAM_ID`

With your real Apple Developer Team ID, so this:

- `REPLACE_WITH_APPLE_TEAM_ID.com.jtruu.epsu`

becomes something like:

- `ABCDE12345.com.jtruu.epsu`

## 2. Keep The Associated Domain In App Config

Already present in:

- [app.json](C:/Users/jtruu/epsu/app.json)

Required value:

- `applinks:epsu.site`

## 3. Deploy The Updated Association File

After replacing the Team ID, redeploy the static site so this live URL is correct:

- `https://epsu.site/.well-known/apple-app-site-association`

It must return the real Team ID, not the placeholder.

## 4. Rebuild The iPhone App

This part is native config, so OTA update is not enough.

You need a new iOS build after the associated-domain / universal-link setup is correct.

## 5. Install The New iPhone Build

Remove ambiguity by testing on the rebuilt app, not an older installed build.

## 6. Test These URLs On iPhone

Test in Safari:

- `https://epsu.site/mod.html?token=test`
- `https://epsu.site/reset-password`
- `https://epsu.site/auth-confirm.html`

For moderator invite flow, the goal is:

- scan QR
- open `https://epsu.site/...`
- iPhone opens Epsu directly or hands off correctly
- Epsu redeems the pending moderator invite

## 7. What To Check If It Still Fails

- The Team ID in `apple-app-site-association` is real
- The live `/.well-known/apple-app-site-association` file is updated
- The installed iPhone app is a new build made after universal-link setup
- The bundle ID is still `com.jtruu.epsu`

## 8. Current Android Note

Android still needs the real release SHA-256 fingerprint in:

- [site/.well-known/assetlinks.json](C:/Users/jtruu/epsu/site/.well-known/assetlinks.json)

Without that fingerprint, verified Android App Links are not fully configured.
