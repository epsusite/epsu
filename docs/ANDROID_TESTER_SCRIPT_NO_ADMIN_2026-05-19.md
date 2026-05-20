# Epsu Android Tester Script

For: `Android phone only`
Audience: non-admin testers
Do not use this file for iPhone or admin testing.

## Before You Start

- use a fresh installed build
- make sure internet is on
- allow notifications if Android asks
- have access to the email inbox for the account you are testing

If the app asks for something that clearly needs admin approval, stop there and contact `jtruu`.

## Important Rules

- do not use admin account
- do not use any SQL
- do not try to guess hidden steps
- if a school or regional Epsu needs approval, message `jtruu`
- if something looks broken, stop and message `jtruu`

## What You Are Testing

You are checking that the app works normally for a regular Android user in these roles:

- guest
- normal user
- member
- moderator if you are given a moderator invite
- host if you are given a host account

## Part 1: First Open

Open the app and check:

- intro screen appears properly
- buttons react
- text fits the screen
- nothing is cut off

## Part 2: Guest Mode

Without logging in:

- open guest mode
- try country selector
- change country
- start guest mode
- open Home
- open Post
- open Settings
- go back out again

Check that guest mode feels alive and not dead.

If there are no visible Epsus in guest mode, message `jtruu`.

## Part 3: Create Account

From login/create account flow:

- open `Create account`
- fill all required fields
- submit
- check email
- open confirmation link
- return to app
- make sure account can log in

If the confirmation link does not work, message `jtruu`.

## Part 4: Login

Test:

- correct login
- wrong password
- logout
- log back in

Make sure:

- buttons react normally
- keyboard behaves normally
- the screen is not cut off

## Part 5: Password Reset

Test:

- open `Forgot password`
- send reset email
- open the reset link from email
- make sure it opens Epsu
- set a new password
- log in with the new password

If the reset link does not open the app or does not finish inside the app, message `jtruu`.

## Part 6: Home Screen

After login:

- open Home
- tap visible cards
- switch between available Epsus
- check if buttons react
- check if text and logos look correct
- check if posts load normally

If an Epsu has no posts, that is not automatically a bug.
Only message `jtruu` if the screen looks broken or gets stuck.

## Part 7: Joining Epsus

If there is an already approved Epsu available:

- try joining it
- reopen it
- make sure you stay joined

If the Epsu is pending approval, stop and contact `jtruu`.

## Part 8: Creating Epsus

If you are told to test Epsu creation:

### School Epsu

- open school creation flow
- type school name
- type website
- submit

### Regional Epsu

- open regional creation flow
- choose country if needed
- type region/city name
- submit

After submission:

- do not expect it to become live instantly
- contact `jtruu` for approval

## Part 9: Post Screen

If you are a joined member of an approved Epsu:

- open Post
- choose an Epsu
- type title
- type content
- submit

Also test:

- search box
- title box
- content box
- keyboard close behavior

If posting is blocked because you are not joined or are muted, that can be normal.

## Part 10: Reactions And Reports

If posts are visible:

- react to a post
- remove your reaction if possible
- report a post if you were specifically told to create a moderation case

Do not spam reports unless that is the planned test.

## Part 11: Moderator Flow

Only do this if `jtruu` gave you a moderator invite link or QR.

- open the invite
- accept it
- make sure moderator tools become available
- open moderation screens
- check that buttons react

If there are no real cases waiting, some moderation screens may be empty.
That is normal.

## Part 12: Host Flow

Only do this if `jtruu` gave you a host account.

- open host tools
- check moderation team screen
- test host-only buttons

If anything needs approval or setup from admin, stop and contact `jtruu`.

## Part 13: Settings

Open Settings and check:

- legal links
- logout
- delete-account related screens
- notification-related parts
- password/account related parts

Do not actually delete the account unless `jtruu` told you to.

## When To Contact Jtruu

Contact `jtruu` immediately if:

- an Epsu needs approval
- a reset or confirmation link fails
- the app gets stuck
- the keyboard behaves badly
- buttons do nothing
- a screen is cut off or overlaps badly
- you are blocked because a role or Epsu state is missing

## Simple Result Message Format

Send messages like this:

- `guest mode worked`
- `signup worked`
- `reset link failed to open app`
- `post screen keyboard behaved badly`
- `join button did nothing`
- `screen text was cut off on Android`

Keep it short.
