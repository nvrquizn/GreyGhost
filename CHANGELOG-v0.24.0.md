# Grey Ghost v0.24.0

## Dragonriders
- Added a permanent Dragon Registry for the server's Dragonriders and owner.
- Staff managers can create and edit unique dragons for members holding the `Dragonrider` role.
- Dragons grow with real time and daily care. Growth stages are Hatchling, Young, Small, Medium, Large, Very Large, Great, and Ancient.
- Daily feeding contributes to growth; missed days delay growth but never harm or delete a dragon.
- Dragon activities unlock with size: interaction, training, flight, patrol, and hunting.
- Hunting counts as the day's feeding when the dragon has not already eaten.
- Dragon history, activity totals, appearance, temperament, age, rider, and former riders remain permanent.
- If a Dragonrider loses the `Dragonrider` role or leaves the server, their dragon becomes permanently wild. Wild dragons remain viewable and cannot be claimed by another rider.

## Player trading
- Added confirmation-based trades for coins, mounts, armour, and supplies.
- Both members must confirm the same offer before anything is transferred.
- Changing an offer clears both confirmations.
- Starter mounts and armour cannot be traded.
- Equipped gear is safely unequipped if its final copy is traded away.

## Expeditions
- Removed the Expedition Pathfinder role reward and all Grey Ghost text referring to it.
- Expeditions now maintain a live plain-text party status message in the channel.
- Joining, leaving, and choosing updates that live message automatically.
- Party members are pinged when an expedition departs, a new stage opens, and the expedition returns.
- The live message shows who has chosen and who is still waiting without exposing the actual choices.

## Events and champions
- Competitive event podiums can now be recorded with `/event podium`.
- The server's `Champions` role is silently granted to recorded top-three event finishers.
- Finished jousts and grand melees also grant `Champions` to their top three finishers when that role exists.
- Removed the old automatic `Champion of the Melee` role behavior.

## Backups
- Server backup format is now v5 and includes dragons and trades.
- v1-v4 backups remain restorable.
