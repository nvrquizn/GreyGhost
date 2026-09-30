# Grey Ghost v0.30.0 — Sticky Messages

- Added `/sticky set` to keep a persistent text message at the bottom of a selected text or announcement channel.
- Whenever a non-bot member posts in that channel, Grey Ghost deletes its previous sticky copy and reposts the same text below the new activity.
- Added `/sticky remove` and `/sticky list`.
- Sticky configuration and the latest Grey Ghost message ID persist in guild settings and survive restarts.
- Sticky reposts suppress mentions so roles/users are not repeatedly pinged.
- Updated `/help`, `/about`, README, package metadata, and release instructions for v0.30.0.
