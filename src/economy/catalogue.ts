export type ShopCategory = "mount" | "armour" | "supply";

export interface ShopItem {
  id: string;
  category: ShopCategory;
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  price: number;
  description: string;
  stackable?: boolean;
  bonuses?: {
    health?: number;
    damage?: number;
    resistance?: number;
  };
}

export const shopItems: readonly ShopItem[] = [
  { id: "worn-courser", category: "mount", tier: 1, name: "Worn Courser", price: 1, description: "An old but willing riding horse.", bonuses: { health: 1 } },
  { id: "trained-courser", category: "mount", tier: 2, name: "Trained Courser", price: 15, description: "A dependable courser accustomed to the lists.", bonuses: { health: 1, damage: 1 } },
  { id: "swift-war-courser", category: "mount", tier: 3, name: "Swift War Courser", price: 50, description: "A quick, battle-trained courser.", bonuses: { damage: 2 } },
  { id: "battle-destrier", category: "mount", tier: 4, name: "Battle Destrier", price: 100, description: "A powerful destrier bred for war and tourney.", bonuses: { health: 2, resistance: 1 } },
  { id: "champions-destrier", category: "mount", tier: 5, name: "Champion’s Destrier", price: 150, description: "A mount fit for the finest knight in the realm.", bonuses: { health: 2, damage: 1, resistance: 1 } },
  { id: "padded-armour", category: "armour", tier: 1, name: "Padded Armour", price: 1, description: "Simple quilted protection for a new combatant.", bonuses: { resistance: 1 } },
  { id: "boiled-leather-armour", category: "armour", tier: 2, name: "Boiled-Leather Armour", price: 15, description: "Hardened leather offering respectable protection.", bonuses: { health: 1, resistance: 1 } },
  { id: "mail-hauberk", category: "armour", tier: 3, name: "Mail Hauberk", price: 50, description: "Interlocking mail made for serious fighting.", bonuses: { resistance: 2 } },
  { id: "plate-and-mail", category: "armour", tier: 4, name: "Plate-and-Mail", price: 100, description: "Plate reinforcement worn over a strong mail defence.", bonuses: { health: 1, resistance: 3 } },
  { id: "castle-forged-plate", category: "armour", tier: 5, name: "Castle-Forged Plate", price: 150, description: "Masterwork plate worthy of a celebrated knight.", bonuses: { health: 2, resistance: 3 } },
  { id: "field-bandage", category: "supply", tier: 1, name: "Field Bandage", price: 5, description: "A healer’s basic supply. Use it with `/recovery bandage` to clear a joust injury.", stackable: true },
] as const;

export const shopItemMap = new Map(shopItems.map((item) => [item.id, item]));

export function itemsByCategory(category?: ShopCategory): ShopItem[] {
  return shopItems.filter((item) => !category || item.category === category);
}

export function countInventoryItem(inventory: readonly string[], itemId: string): number {
  return inventory.filter((id) => id === itemId).length;
}

export function formatItemBonuses(item: ShopItem): string {
  const parts = [
    item.bonuses?.health ? `Health +${item.bonuses.health}` : undefined,
    item.bonuses?.damage ? `Damage +${item.bonuses.damage}` : undefined,
    item.bonuses?.resistance ? `Resistance +${item.bonuses.resistance}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : item.stackable ? "Consumable" : "No bonuses";
}
