# Grey Ghost v0.27.0 — Tavern

## Tavern mini-games
- Added `/tavern dice`, `/tavern darts`, `/tavern cups`, and `/tavern stats`.
- Tavern games use no wagers and never subtract a player's coins.
- Winning can award small fixed coin prizes, capped at 6 tavern coins per UTC day.
- Each game has a 30-minute per-player cooldown.
- Tavern play does not award Renown.
- Tavern statistics are persistent and included in backups.

## Server log reliability
- Deleted messages are now snapshotted while Grey Ghost is online so deletion logs can retain author/content information even when Discord emits a partial deleted message.
- Deleted-message logging now has a fallback for partial/uncached messages and accepts announcement channels as configured server-log destinations.
- Ghost-ping detection continues to operate for recent deleted messages when enough information is available.

## Backups
- Backup format is now v7 and includes tavern statistics.
- v1–v6 backups remain restorable.
