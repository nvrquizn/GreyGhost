# Grey Ghost v0.26.1

- Splits event publishing into two configured channels.
- `/setup event-channel` now sets the channel where published joust, melee, race, and future festival announcements are posted.
- `/setup event-chat` sets the channel members are directed to for entry commands.
- Tourney Summons remains outside the embed so Discord delivers the ping, while the message points to the configured event chat.
- Drafts may be created anywhere; publication is routed to the configured event announcement channel.
- Keeps all v0.26.0 stable expansion, horse races, hunts, and dragon lair features.
