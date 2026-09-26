# Grey Ghost v0.24.2

## Special Dragon Grants

- Added `/dragon grant user:@member` for server managers to grant dragon eligibility without the configured Dragonrider/moderator role.
- Added `/dragon revoke user:@member` to remove that special eligibility.
- Special riders are still limited to one dragon and may create only their own dragon unless they are a server manager.
- Added `/setup dragon-grants channel:#channel` to choose where special riders are pinged with configuration instructions.
- If that channel is unavailable or not configured, Grey Ghost attempts to DM the recipient instead.
- Granting eligibility to a former rider restores their retired dragon rather than creating a replacement.
- The Dragonrider role remains required for moderation commands; special dragon eligibility grants dragon access only.
