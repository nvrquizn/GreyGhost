# Grey Ghost v0.25.0

## Combat, Renown, Heirlooms, and Event Prizes

- Added `/duel challenge`, `/duel accept`, `/duel decline`, `/duel cancel`, and `/duel status`.
- Realm characters may complete up to **5 training duels per week**, against different opponents.
- Completed duels train one random combat stat for each duelist; winners earn **2 Renown** and losers earn **1 Renown**.
- Added permanent **Renown** with `/renown view`, `/renown leaderboard`, and manager-only `/renown grant`.
- Character cards now show Renown and named-heirloom totals.
- Joust matchmaking becomes Renown-aware whenever at least one active rider has Renown, pairing riders with similar Renown where cross-House rules permit. If nobody has Renown, Grey Ghost uses the normal randomized draw.
- Joust and grand-melee podium finishers earn additional Renown.
- Successful expeditions now award Renown alongside their existing rewards.

## Named Weapons & Heirlooms

- Added `/heirloom list`, `/heirloom view`, `/heirloom rename`, and manager-only `/heirloom grant`.
- Heirlooms may be swords, daggers, shields, crowns, rings, banners, relics, or custom objects.
- Heirlooms are permanent character records and also appear in `/inventory`.

## Competitive Event Rewards

- Added `/setup champions-role role:@Champions`.
- Added `/setup tourney-summons role:@Tourney Summons`.
- The configured **Champions** role is awarded to the top three finishers in supported competitive events.
- `/joust publish` and `/melee publish` now choose and display the event's Admirer-role prize package.
- Publication pings the configured Tourney Summons role **outside the embed** and directs members to the event channel with the join command.
- First place may choose **1–2 Admirer roles**.
- Second place randomly receives one of three reward modes unless overridden by the publisher: player choice, Grey Ghost's choice, or one of each.
- Third place receives one Admirer role chosen by Grey Ghost.
- Publishers may preset the second- and third-place Admirer rewards.
- Grey Ghost rerolls an automatic reward if the winner already owns that Admirer role.
- **Grey Ghost Admirer** remains eligible for automatic rewards.
- Added `/prize choose first:@Role second:@Role` and `/prize view` for pending player-choice rewards.
- Grand melees now use a draft → publish flow so their announcement, rewards, and Tourney Summons ping work like jousts.

The event-prize framework already recognizes future `race` and `festival` event types so horse races and seasonal festivals can plug into the same Champions/Admirer system in their planned updates.
