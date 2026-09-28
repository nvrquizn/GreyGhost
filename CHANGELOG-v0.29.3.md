# Grey Ghost v0.29.3

## Help pagination

- Replaces the oversized single `/help` / `?help` roster with proper command pages.
- Previous/Next buttons move through General, Realm & Community, Activities & Competition, Progression & Equipment, and any staff/moderation pages the viewer can access.
- Help controls are locked to the member who opened that command roster.

## Statistics pagination

- Splits long Realm statistics into dedicated Overview, House Point Standings, House Allegiance/Dance allegiance (when configured), and Collections & Records pages.
- `/stats view` and `?stats view` publish every statistics page as separate messages instead of making the viewer request the next page.
- The persistent statistics dashboard now publishes and refreshes every page separately every 15 minutes.
- Existing single-message statistics dashboards migrate automatically: the old message becomes page 1 and Grey Ghost creates the remaining page messages.

## Fixed

- Prevents `/help` from exceeding Discord embed field limits as the command roster grows.

## Metadata

- Version remains v0.29.3 because the earlier v0.29.3 build was replaced before installation.

## Build correction
- Fixed strict TypeScript `noUncheckedIndexedAccess` errors introduced by help pagination and multi-page statistics.
- Help and statistics page payloads now guard page access before sending Discord embeds.
