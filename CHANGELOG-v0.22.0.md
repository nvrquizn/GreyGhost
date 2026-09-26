# Grey Ghost v0.22.0

## Joust spoils and ransoms

- Jousts can now be created as **competitive** or **casual**.
- Every competitive tilt gives its winner a right of spoils over the defeated rider.
- `/spoils claim` can take either 25% of the loser's coins (capped at 50 coins), their best non-starter horse, or their best non-starter armour.
- Tier-I starter equipment is protected from seizure.
- Seized equipment enters a 48-hour ransom period.
- The defeated rider may use `/spoils ransom` to reclaim seized equipment for 75% of its shop price.
- If the ransom expires, the equipment transfers to the winner.
- `/spoils status` shows recent claims and ransom deadlines.

## Grand melees

- Added `/melee create`, `/melee enter`, `/melee start`, `/melee next`, `/melee status`, and `/melee cancel`.
- Grand melees are horse-free elimination tournaments using trained character stats and equipped armour.
- Bout winners earn House Points; the champion receives bonus House Points and 20 coins.
- Melee losses can cause the same temporary combat injuries introduced in v0.21.0.
- Grand melee champions earn the **Grand Melee Champion** achievement and are recorded in the Chronicles.
- If the server has a manageable role named `Champion of the Melee`, Grey Ghost automatically moves that title to the newest champion.

## Backups

- Backup format upgraded to **v3** to include combat state (melees, spoils, and ransom records).
- v1 and v2 backups remain restorable.
