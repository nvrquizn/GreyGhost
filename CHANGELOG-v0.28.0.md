# Grey Ghost v0.28.0 — Seasonal Festivals

## Seasonal festival framework

- Added `/festival create`, `/festival publish`, `/festival join`, `/festival status`, `/festival objectives`, `/festival shop`, `/festival buy`, `/festival dragon`, `/festival end`, `/festival cancel`, and `/festival history`.
- Festival publication uses the configured event announcement channel and directs `@Tourney Summons` to the configured event chat. The role mention is normal message content outside the embed so Discord delivers the ping.
- Supports Autumn, Winter, Spring, Midsummer, and custom festival themes with 1–14 day durations.
- Festival Points and Festival Tokens are scoped to one festival and archived when it ends.

## Temporary objectives and activity integration

Festival participants can complete temporary objectives through normal Realm activity. Grey Ghost tracks:

- two completed duels;
- one hunt;
- one tavern-game win;
- one completed horse race;
- one returned expedition;
- one completed joust;
- one completed grand melee.

Completing objectives grants Festival Points and Festival Tokens. Horse-race, joust, and grand-melee podiums also grant additional Festival Points and Tokens while a festival is active.

## Festival shop

Festival Tokens can be spent on permanent cosmetic keepsakes such as the Autumn Saddlecloth, Gilded Antler Brooch, Red-Gold Riding Cloak, Harvest Tourney Favor, Engraved Harvest Goblet, Gilded Bridle Rosette, and Bronze Leaf Sword-Pommel. Unspent tokens cannot be spent after that festival closes.

## Dragons at festivals

Bonded dragons may be registered as attending a festival with `/festival dragon`. Attendance is recorded in the dragon's history but gives no Festival Points, so dragon access never creates a competitive advantage.

## Festival winners

When a festival concludes, Grey Ghost ranks participants by Festival Points, gives the top three the configured Champions role, applies the existing Admirer-role prize framework, grants permanent Renown to the podium, and stores the results in `/festival history`.

## Backups

Backup format is now **v8** and includes seasonal festival data. Grey Ghost continues to restore v1–v7 backups.
