# Grey Ghost v0.24.1

## Added
- `/setup moderator-role role:@Role` designates the role Grey Ghost requires for moderation commands and dragon creation.
- `/dragon growth dragon:<name> days:<number>` lets server managers add growth days manually. Growth days advance both age progress and feeding progress.
- Dragonriders can create a dragon for themselves; server managers can create one for another eligible Dragonrider.

## Changed
- A member may have only one dragon in the registry.
- Losing the configured moderator/Dragonrider role retires the rider's dragon into the wild.
- Regaining that role automatically restores the same retired dragon to its original rider.
- A retired dragon cannot be replaced by creating a second dragon.
- Grey Ghost moderation commands now require the configured moderator role as an additional access gate.

## Compatibility
- Existing v0.24.0 dragon records remain valid.
- Existing servers may configure the role with `/setup moderator-role`. Until configured, Grey Ghost falls back to a role named `Dragonrider` for backwards compatibility.
