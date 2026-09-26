# Grey Ghost v0.21.0

## Main focus
Progression administration, recovery, bandages, and first-pass equipment effects for jousts.

## Added

- `/grant coins` — staff can grant coins to any Realm character without spending from their own coin stash.
- `/grant item` — staff can grant mounts, armour, or supplies to themselves or another member without charging coins.
- `/recovery status` — members can check current joust injuries and Field Bandage count.
- `/recovery bandage` — members can consume one Field Bandage to clear their current injury.
- Field Bandage shop item.
- Equipment bonuses for mounts and armour.
- Joust injury rolls after tilts.
- Equipped gear now gives small hidden bonuses during joust simulations.
- Current injury applies a small hidden penalty during joust simulations until it expires or is treated.

## Notes

- `/buy` still spends the member’s coins.
- `/grant` is intentionally staff-only and does not subtract from the giver’s purse.
- Existing v0.20.0 economy data upgrades automatically when loaded.
