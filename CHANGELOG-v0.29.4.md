# Grey Ghost v0.29.4

## Moderation & Case Management

- Added `/softban` / `?softban`: bans and immediately unbans a user while removing up to seven days of recent messages, allowing them to rejoin later.
- Added `/warnings` / `?warnings` for a member's warning history.
- Added `/case` / `?case` for direct case-number lookup.
- Added `/modlogs` / `?modlogs` for a member's complete moderation history.
- Added `/note` / `?note` to create private staff notes that do not count as punishment and do not notify the member.
- Added `/notes` / `?notes` to review private staff notes.
- Existing `/moderation` case management remains available for editing, voiding, clearing warnings, case/user notes, and note deletion.
- Added `/moderation case-evidence` so staff can attach or replace evidence on an existing case without deleting its audit history.
- Warning, strike, timeout, kick, ban, and softban actions now accept an optional rule/law reference which is stored in the case and moderation log.
- Softbans, warnings, kicks, bans, timeouts, and other moderation actions continue to receive permanent numbered cases.
- Added the new moderation commands to the configured moderator-role gate and command roster.

## Compatibility

- Existing moderation data remains valid; `rule` is optional and the new `softban` case action extends the existing moderation schema.
