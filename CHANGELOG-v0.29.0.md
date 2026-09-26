# Grey Ghost v0.29.0 — House Chronicles & Profile Achievements

## House Chronicles
- Added `/housechronicle view house:@House` and prefix-equivalent `?housechronicle view`.
- Added `/housechronicle add` for server managers to record special House history.
- House Chronicles summarize current House Points, season victories, completed House quests, major event placements, and the most renowned current House members.
- House season victories and completed House quests are recorded automatically.
- Top-three placements in jousts, grand melees, horse races, and seasonal festivals are recorded automatically for the winner's configured House(s).

## Profiles
- `/profile view` and `?profile view` now display earned achievements directly on the Realm Profile.
- Profile footer now includes admirer-role count, title progress, and achievement progress.
- `/achievements view` remains the detailed achievement history with descriptions and award dates.

## Data
- House Chronicle records are stored in guild settings and therefore included automatically in existing server backups.
