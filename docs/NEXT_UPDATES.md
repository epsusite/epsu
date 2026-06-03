# Next Updates

Use this file as a pre-flight checklist before any production release or production OTA update command.

Rule for future production work:
- Before I suggest or run production commands, check this file first.
- Treat items here as release blockers unless the user explicitly decides otherwise.

## Pending UI text fix

Date noted: 2026-05-30

Issue:
- On the new school screen, the school name input uses the placeholder `Example: Massachusetts Institute of Technology`.
- On smaller screens, the placeholder is too long for the single-line `TextInput`.
- The `Technology` portion gets pushed to the far edge of the field and the final `y` can appear nearly cut off or almost invisible.
- This is a placeholder-width problem inside the input, not normal body text.

User-confirmed observation:
- A cropped screenshot showed the trailing `y` from `Technology`.
- The user verified this on-device after being alerted to the issue.

Requested fix:
- Replace `Example:` with `E.g.:` anywhere this placeholder pattern appears in the affected create-flow inputs.

Required text changes:
- School name box:
  `Example: Massachusetts Institute of Technology`
  ->
  `E.g.: Massachusetts Institute of Technology`
- School website box:
  `Example: mit.edu`
  ->
  `E.g.: mit.edu`
- Regional name input:
  Replace the same `Example:` prefix with `E.g.:` there as well.

Release guidance:
- This is eligible for an Expo OTA update because it is a JS/text-only change.
- OTA can update existing installed users on the matching production runtime/channel.
- OTA does not guarantee that a brand-new store download has the fix on first launch, because the bundled binary may still contain the old placeholder text until a new store build is released.
- If the goal is to guarantee the fix for all new downloads immediately, include it in the next store submission.

## Pending admin queue issue

Date noted: 2026-05-30

Issue:
- In admin queue, some posts can be deleted when further context is impossible.
- This needs follow-up before future production work.

Current note:
- User reported this as an issue to track in release planning.
- Exact reproduction steps and affected post states still need to be documented when investigated.

## Pending guest mode bubble issue

Date noted: 2026-06-02

Issue:
- On smaller screens, the guest mode bubble can block everything.
- This needs layout follow-up before future production work.

Current note:
- User reported this as an issue to track in release planning.
- Exact reproduction steps, affected device sizes, and whether the block is caused by height, z-index, or touch interception still need to be documented when investigated.

## Pending reply-post action visibility issue

Date noted: 2026-06-02

Issue:
- On Epsus with reply posts, the original post and the reply can take up so much space that the bottom action buttons are sometimes not visible.
- This needs feed layout follow-up before future production work.

Current note:
- User reported this as an issue to track in release planning.
- Exact affected post layouts, device sizes, and whether the problem is caused by reply context height, card spacing, or bottom action placement still need to be documented when investigated.
