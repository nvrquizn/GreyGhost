export type ShopCategory = "mount" | "armour";

export interface ShopItem {
  id: string;
  category: ShopCategory;
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  price: number;
  description: string;
}

export const shopItems: readonly ShopItem[] = [
  { id: "worn-courser", category: "mount", tier: 1, name: "Worn Courser", price: 1, description: "An old but willing riding horse." },
  { id: "trained-courser", category: "mount", tier: 2, name: "Trained Courser", price: 15, description: "A dependable courser accustomed to the lists." },
  { id: "swift-war-courser", category: "mount", tier: 3, name: "Swift War Courser", price: 50, description: "A quick, battle-trained courser." },
  { id: "battle-destrier", category: "mount", tier: 4, name: "Battle Destrier", price: 100, description: "A powerful destrier bred for war and tourney." },
  { id: "champions-destrier", category: "mount", tier: 5, name: "Champion’s Destrier", price: 150, description: "A mount fit for the finest knight in the realm." },
  { id: "padded-armour", category: "armour", tier: 1, name: "Padded Armour", price: 1, description: "Simple quilted protection for a new combatant." },
  { id: "boiled-leather-armour", category: "armour", tier: 2, name: "Boiled-Leather Armour", price: 15, description: "Hardened leather offering respectable protection." },
  { id: "mail-hauberk", category: "armour", tier: 3, name: "Mail Hauberk", price: 50, description: "Interlocking mail made for serious fighting." },
  { id: "plate-and-mail", category: "armour", tier: 4, name: "Plate-and-Mail", price: 100, description: "Plate reinforcement worn over a strong mail defence." },
  { id: "castle-forged-plate", category: "armour", tier: 5, name: "Castle-Forged Plate", price: 150, description: "Masterwork plate worthy of a celebrated knight." },
] as const;

export const shopItemMap = new Map(shopItems.map((item) => [item.id, item]));

export function itemsByCategory(category?: ShopCategory): ShopItem[] {
  return shopItems.filter((item) => !category || item.category === category);
}
