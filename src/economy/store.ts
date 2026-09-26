import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { shopItemMap } from "./catalogue.js";

const coinTransactionSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(120),
  createdAt: z.number().int().positive(),
});

const injurySchema = z.object({
  severity: z.enum(["bruised", "wounded", "maimed"]),
  reason: z.string().min(1).max(160),
  createdAt: z.number().int().positive(),
  clearsAt: z.number().int().positive().optional(),
});

const heirloomSchema = z.object({
  id: z.string().min(1).max(24),
  name: z.string().min(1).max(80),
  type: z.enum(["sword", "dagger", "shield", "crown", "ring", "banner", "relic", "other"]),
  description: z.string().max(500).default(""),
  grantedAt: z.number().int().positive(),
  grantedBy: z.string(),
});

const characterSchema = z.object({
  name: z.string().min(1).max(40),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  health: z.number().int().min(0).max(1000).default(0),
  damage: z.number().int().min(0).max(1000).default(0),
  resistance: z.number().int().min(0).max(1000).default(0),
  renown: z.number().int().min(0).default(0),
  heirlooms: z.array(heirloomSchema).max(100).default([]),
  duelWeekKey: z.string().optional(),
  duelWeekCount: z.number().int().min(0).max(5).default(0),
  duelWeekOpponents: z.array(z.string()).max(5).default([]),
});

const playerSchema = z.object({
  character: characterSchema,
  coins: z.number().int().min(0).default(0),
  coinHistory: z.array(coinTransactionSchema).max(100).default([]),
  lastDailyAt: z.number().int().positive().optional(),
  lastTrainingAt: z.number().int().positive().optional(),
  inventory: z.array(z.string()).max(250).default([]),
  cosmetics: z.array(z.string()).max(100).default([]),
  equippedMountId: z.string().optional(),
  equippedArmourId: z.string().optional(),
  injury: injurySchema.optional(),
});

const guildEconomySchema = z.object({
  players: z.record(z.string(), playerSchema).default({}),
});

const economyFileSchema = z.record(z.string(), guildEconomySchema);

export type EconomyPlayer = z.infer<typeof playerSchema>;
export type EconomyGuild = z.infer<typeof guildEconomySchema>;
export type CharacterStat = "health" | "damage" | "resistance";
export type InjurySeverity = "bruised" | "wounded" | "maimed";
export type Heirloom = z.infer<typeof heirloomSchema>;
export type HeirloomType = Heirloom["type"];

export interface JoustBonuses {
  health: number;
  damage: number;
  resistance: number;
  injuryPenalty: number;
}

const economyPath = resolve(process.cwd(), "data", "economy.json");
let cache: Record<string, EconomyGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, EconomyGuild>> {
  if (cache) return cache;
  try {
    cache = economyFileSchema.parse(JSON.parse(await readFile(economyPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const data = await load();
  const temp = `${economyPath}.tmp`;
  await mkdir(dirname(economyPath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temp, economyPath);
}

async function mutate<T>(fn: (data: Record<string, EconomyGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, EconomyGuild>, guildId: string): EconomyGuild {
  return (data[guildId] ??= { players: {} });
}

function ensurePlayer(data: Record<string, EconomyGuild>, guildId: string, userId: string): EconomyPlayer {
  const player = guildOf(data, guildId).players[userId];
  if (!player) throw new Error("CHARACTER_REQUIRED");
  return player;
}

export async function getEconomyPlayer(guildId: string, userId: string): Promise<EconomyPlayer | undefined> {
  return (await load())[guildId]?.players[userId];
}

export async function createCharacter(guildId: string, userId: string, name: string): Promise<EconomyPlayer> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    if (guild.players[userId]) throw new Error("CHARACTER_EXISTS");
    const now = Date.now();
    const player = playerSchema.parse({
      character: { name: name.trim(), createdAt: now, updatedAt: now, health: 0, damage: 0, resistance: 0 },
      coins: 0,
      coinHistory: [],
      inventory: [],
      cosmetics: [],
    });
    guild.players[userId] = player;
    return player;
  });
}

export async function renameCharacter(guildId: string, userId: string, name: string): Promise<EconomyPlayer> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    player.character.name = name.trim();
    player.character.updatedAt = Date.now();
    return player;
  });
}

export async function claimDaily(guildId: string, userId: string, now = Date.now()): Promise<{ player: EconomyPlayer; reward: number }> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const cooldown = 24 * 60 * 60 * 1000;
    if (player.lastDailyAt && now - player.lastDailyAt < cooldown) {
      const error = new Error("DAILY_COOLDOWN") as Error & { readyAt?: number };
      error.readyAt = player.lastDailyAt + cooldown;
      throw error;
    }
    const reward = 2 + Math.floor(Math.random() * 4);
    player.coins += reward;
    player.lastDailyAt = now;
    player.coinHistory.push({ amount: reward, reason: "Daily coin", createdAt: now });
    player.coinHistory = player.coinHistory.slice(-100);
    return { player, reward };
  });
}

export async function trainDaily(guildId: string, userId: string, stat: CharacterStat, now = Date.now()): Promise<EconomyPlayer> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const cooldown = 24 * 60 * 60 * 1000;
    if (player.lastTrainingAt && now - player.lastTrainingAt < cooldown) {
      const error = new Error("TRAINING_COOLDOWN") as Error & { readyAt?: number };
      error.readyAt = player.lastTrainingAt + cooldown;
      throw error;
    }
    player.character[stat] += 1;
    player.character.updatedAt = now;
    player.lastTrainingAt = now;
    return player;
  });
}

export async function buyItem(guildId: string, userId: string, itemId: string): Promise<{ player: EconomyPlayer; price: number }> {
  const item = shopItemMap.get(itemId);
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    if (!item.stackable && player.inventory.includes(item.id)) throw new Error("ITEM_OWNED");
    if (player.coins < item.price) throw new Error("INSUFFICIENT_COINS");
    player.coins -= item.price;
    player.inventory.push(item.id);
    player.coinHistory.push({ amount: -item.price, reason: `Purchased ${item.name}`, createdAt: Date.now() });
    player.coinHistory = player.coinHistory.slice(-100);
    if (item.category === "mount" && !player.equippedMountId) player.equippedMountId = item.id;
    if (item.category === "armour" && !player.equippedArmourId) player.equippedArmourId = item.id;
    return { player, price: item.price };
  });
}

export async function equipItem(guildId: string, userId: string, itemId: string): Promise<EconomyPlayer> {
  const item = shopItemMap.get(itemId);
  if (!item) throw new Error("ITEM_NOT_FOUND");
  if (item.category === "supply") throw new Error("ITEM_NOT_EQUIPPABLE");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    if (!player.inventory.includes(item.id)) throw new Error("ITEM_NOT_OWNED");
    if (item.category === "mount") player.equippedMountId = item.id;
    else player.equippedArmourId = item.id;
    return player;
  });
}

export async function grantCoins(guildId: string, targetId: string, amount: number, staffId: string, reason = "Staff grant"): Promise<EconomyPlayer> {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("INVALID_AMOUNT");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, targetId);
    player.coins += amount;
    player.coinHistory.push({ amount, reason: `${reason} · by ${staffId}`, createdAt: Date.now() });
    player.coinHistory = player.coinHistory.slice(-100);
    return player;
  });
}

export async function grantItem(guildId: string, targetId: string, itemId: string): Promise<EconomyPlayer> {
  const item = shopItemMap.get(itemId);
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, targetId);
    if (!item.stackable && player.inventory.includes(item.id)) throw new Error("ITEM_OWNED");
    player.inventory.push(item.id);
    if (item.category === "mount" && !player.equippedMountId) player.equippedMountId = item.id;
    if (item.category === "armour" && !player.equippedArmourId) player.equippedArmourId = item.id;
    return player;
  });
}

export async function consumeItem(guildId: string, userId: string, itemId: string): Promise<EconomyPlayer> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const index = player.inventory.indexOf(itemId);
    if (index < 0) throw new Error("ITEM_NOT_OWNED");
    player.inventory.splice(index, 1);
    return player;
  });
}


export async function grantCosmetic(guildId: string, targetId: string, cosmeticId: string): Promise<EconomyPlayer> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, targetId);
    if (!player.cosmetics.includes(cosmeticId)) player.cosmetics.push(cosmeticId);
    return player;
  });
}

export async function applyExpeditionInjury(guildId: string, userId: string, reason: string, random: () => number = Math.random): Promise<EconomyPlayer | undefined> {
  if (random() >= 0.4) return undefined;
  const severity: InjurySeverity = random() < 0.25 ? "wounded" : "bruised";
  const hours = severity === "wounded" ? 36 : 18;
  return mutate((data) => {
    const player = guildOf(data, guildId).players[userId];
    if (!player) return undefined;
    player.injury = {
      severity,
      reason,
      createdAt: Date.now(),
      clearsAt: Date.now() + hours * 60 * 60 * 1000,
    };
    return player;
  });
}

export async function applyJoustInjury(guildId: string, userId: string, reason: string, random: () => number = Math.random): Promise<EconomyPlayer | undefined> {
  const roll = random();
  if (roll >= 0.35) return undefined;
  const severity: InjurySeverity = roll < 0.05 ? "maimed" : roll < 0.16 ? "wounded" : "bruised";
  const hours = severity === "maimed" ? 72 : severity === "wounded" ? 48 : 24;
  return mutate((data) => {
    const player = guildOf(data, guildId).players[userId];
    if (!player) return undefined;
    player.injury = {
      severity,
      reason,
      createdAt: Date.now(),
      clearsAt: Date.now() + hours * 60 * 60 * 1000,
    };
    return player;
  });
}

export async function clearExpiredInjury(guildId: string, userId: string, now = Date.now()): Promise<EconomyPlayer | undefined> {
  return mutate((data) => {
    const player = guildOf(data, guildId).players[userId];
    if (!player) return undefined;
    if (player.injury?.clearsAt && player.injury.clearsAt <= now) delete player.injury;
    return player;
  });
}

export async function useBandage(guildId: string, userId: string): Promise<EconomyPlayer> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    if (!player.injury) throw new Error("NOT_INJURED");
    const index = player.inventory.indexOf("field-bandage");
    if (index < 0) throw new Error("BANDAGE_REQUIRED");
    player.inventory.splice(index, 1);
    delete player.injury;
    return player;
  });
}

export function injuryPenalty(severity?: InjurySeverity): number {
  if (severity === "maimed") return 3;
  if (severity === "wounded") return 2;
  if (severity === "bruised") return 1;
  return 0;
}

export async function getJoustBonuses(guildId: string, userId: string): Promise<JoustBonuses> {
  const player = await getEconomyPlayer(guildId, userId);
  const mount = player?.equippedMountId ? shopItemMap.get(player.equippedMountId) : undefined;
  const armour = player?.equippedArmourId ? shopItemMap.get(player.equippedArmourId) : undefined;
  const injury = player?.injury;
  return {
    health: (mount?.bonuses?.health ?? 0) + (armour?.bonuses?.health ?? 0),
    damage: (mount?.bonuses?.damage ?? 0) + (armour?.bonuses?.damage ?? 0),
    resistance: (mount?.bonuses?.resistance ?? 0) + (armour?.bonuses?.resistance ?? 0),
    injuryPenalty: injuryPenalty(injury?.severity),
  };
}


export async function takeSpoilsCoins(guildId: string, winnerId: string, loserId: string, cap = 50): Promise<number> {
  return mutate((data) => {
    const winner = ensurePlayer(data, guildId, winnerId);
    const loser = ensurePlayer(data, guildId, loserId);
    const amount = Math.min(cap, Math.floor(loser.coins * 0.25));
    if (amount < 1) throw new Error("NO_COINS_TO_CLAIM");
    loser.coins -= amount;
    winner.coins += amount;
    const now = Date.now();
    loser.coinHistory.push({ amount: -amount, reason: "Competitive joust spoils", createdAt: now });
    winner.coinHistory.push({ amount, reason: "Competitive joust spoils", createdAt: now });
    loser.coinHistory = loser.coinHistory.slice(-100);
    winner.coinHistory = winner.coinHistory.slice(-100);
    return amount;
  });
}

export async function escrowBestItem(guildId: string, userId: string, category: "mount" | "armour"): Promise<import("./catalogue.js").ShopItem> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const candidates = player.inventory
      .map((id) => shopItemMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item) && item!.category === category && item!.tier > 1)
      .sort((a, b) => b.tier - a.tier || b.price - a.price);
    const item = candidates[0];
    if (!item) throw new Error("NO_ELIGIBLE_SPOILS_ITEM");
    const index = player.inventory.indexOf(item.id);
    if (index >= 0) player.inventory.splice(index, 1);
    if (category === "mount" && player.equippedMountId === item.id) delete player.equippedMountId;
    if (category === "armour" && player.equippedArmourId === item.id) delete player.equippedArmourId;
    return item;
  });
}

export async function receiveTransferredItem(guildId: string, userId: string, itemId: string): Promise<EconomyPlayer> {
  if (!shopItemMap.has(itemId)) throw new Error("ITEM_NOT_FOUND");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    player.inventory.push(itemId);
    return player;
  });
}

export async function payRansom(guildId: string, loserId: string, winnerId: string, amount: number, itemId: string): Promise<void> {
  await mutate((data) => {
    const loser = ensurePlayer(data, guildId, loserId);
    const winner = ensurePlayer(data, guildId, winnerId);
    if (loser.coins < amount) throw new Error("INSUFFICIENT_COINS");
    loser.coins -= amount;
    winner.coins += amount;
    loser.inventory.push(itemId);
    const now = Date.now();
    loser.coinHistory.push({ amount: -amount, reason: "Equipment ransom", createdAt: now });
    winner.coinHistory.push({ amount, reason: "Equipment ransom received", createdAt: now });
    loser.coinHistory = loser.coinHistory.slice(-100);
    winner.coinHistory = winner.coinHistory.slice(-100);
  });
}

export async function exportGuildEconomy(guildId: string): Promise<EconomyGuild> {
  const current = (await load())[guildId] ?? { players: {} };
  return guildEconomySchema.parse(current);
}

export async function replaceGuildEconomy(guildId: string, value: unknown): Promise<void> {
  const parsed = guildEconomySchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}

export const economyGuildSchema = guildEconomySchema;


export function renownTitle(renown: number): string {
  if (renown >= 600) return "Legendary";
  if (renown >= 300) return "Celebrated";
  if (renown >= 150) return "Renowned";
  if (renown >= 75) return "Noted";
  if (renown >= 25) return "Recognized";
  return "Unknown";
}

export async function changeRenown(guildId: string, userId: string, delta: number): Promise<EconomyPlayer> {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("INVALID_RENOWN_DELTA");
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    player.character.renown = Math.max(0, player.character.renown + delta);
    player.character.updatedAt = Date.now();
    return player;
  });
}

export async function renownLeaderboard(guildId: string, limit = 10): Promise<Array<{ userId: string; renown: number; name: string }>> {
  const guild = (await load())[guildId];
  if (!guild) return [];
  return Object.entries(guild.players)
    .map(([userId, player]) => ({ userId, renown: player.character.renown, name: player.character.name }))
    .sort((a, b) => b.renown - a.renown || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function getRenownMap(guildId: string, userIds: string[]): Promise<Map<string, number>> {
  const guild = (await load())[guildId];
  return new Map(userIds.map((userId) => [userId, guild?.players[userId]?.character.renown ?? 0]));
}

function duelWeekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export async function getDuelAllowance(guildId: string, userId: string): Promise<{ used: number; remaining: number; weekKey: string }> {
  const player = await getEconomyPlayer(guildId, userId);
  if (!player) throw new Error("CHARACTER_REQUIRED");
  const key = duelWeekKey();
  const used = player.character.duelWeekKey === key ? player.character.duelWeekCount : 0;
  return { used, remaining: Math.max(0, 5 - used), weekKey: key };
}

export async function completeDuelProgress(guildId: string, winnerId: string, loserId: string, random: () => number = Math.random): Promise<{ winner: EconomyPlayer; loser: EconomyPlayer; winnerStat: CharacterStat; loserStat: CharacterStat }> {
  return mutate((data) => {
    const winner = ensurePlayer(data, guildId, winnerId);
    const loser = ensurePlayer(data, guildId, loserId);
    const key = duelWeekKey();
    for (const player of [winner, loser]) {
      if (player.character.duelWeekKey !== key) {
        player.character.duelWeekKey = key;
        player.character.duelWeekCount = 0;
        player.character.duelWeekOpponents = [];
      }
      if (player.character.duelWeekCount >= 5) throw new Error("DUEL_WEEK_LIMIT");
    }
    if (winner.character.duelWeekOpponents.includes(loserId) || loser.character.duelWeekOpponents.includes(winnerId)) throw new Error("DUEL_OPPONENT_ALREADY_FOUGHT");
    winner.character.duelWeekCount += 1;
    loser.character.duelWeekCount += 1;
    winner.character.duelWeekOpponents.push(loserId);
    loser.character.duelWeekOpponents.push(winnerId);
    const stats: CharacterStat[] = ["health", "damage", "resistance"];
    const winnerStat = stats[Math.floor(random() * stats.length)]!;
    const loserStat = stats[Math.floor(random() * stats.length)]!;
    winner.character[winnerStat] += 1;
    loser.character[loserStat] += 1;
    winner.character.renown += 2;
    loser.character.renown += 1;
    const now = Date.now();
    winner.character.updatedAt = now;
    loser.character.updatedAt = now;
    return { winner, loser, winnerStat, loserStat };
  });
}

export async function grantHeirloom(guildId: string, userId: string, input: { name: string; type: HeirloomType; description?: string; grantedBy: string }): Promise<Heirloom> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const id = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const item = heirloomSchema.parse({ id, name: input.name.trim(), type: input.type, description: input.description ?? "", grantedAt: Date.now(), grantedBy: input.grantedBy });
    player.character.heirlooms.push(item);
    player.character.updatedAt = Date.now();
    return item;
  });
}

export async function renameHeirloom(guildId: string, userId: string, heirloomId: string, name: string): Promise<Heirloom> {
  return mutate((data) => {
    const player = ensurePlayer(data, guildId, userId);
    const item = player.character.heirlooms.find((candidate) => candidate.id === heirloomId);
    if (!item) throw new Error("HEIRLOOM_NOT_FOUND");
    item.name = name.trim();
    player.character.updatedAt = Date.now();
    return item;
  });
}

export async function executeTradeTransfer(
  guildId: string,
  leftId: string,
  rightId: string,
  leftOffer: { coins: number; itemIds: string[] },
  rightOffer: { coins: number; itemIds: string[] },
): Promise<void> {
  await mutate((data) => {
    const left = ensurePlayer(data, guildId, leftId);
    const right = ensurePlayer(data, guildId, rightId);
    if (left.coins < leftOffer.coins || right.coins < rightOffer.coins) throw new Error("TRADE_INSUFFICIENT_COINS");

    const validateItems = (player: EconomyPlayer, itemIds: string[]) => {
      const needed = new Map<string, number>();
      for (const id of itemIds) needed.set(id, (needed.get(id) ?? 0) + 1);
      for (const [id, count] of needed) {
        const item = shopItemMap.get(id);
        if (!item) throw new Error("ITEM_NOT_FOUND");
        if ((item.category === "mount" || item.category === "armour") && item.tier === 1) throw new Error("STARTER_ITEM_BOUND");
        if (player.inventory.filter((owned) => owned === id).length < count) throw new Error("TRADE_ITEM_NOT_OWNED");
      }
    };
    validateItems(left, leftOffer.itemIds);
    validateItems(right, rightOffer.itemIds);

    const removeItems = (player: EconomyPlayer, itemIds: string[]) => {
      for (const id of itemIds) {
        const index = player.inventory.indexOf(id);
        if (index >= 0) player.inventory.splice(index, 1);
        if (player.equippedMountId === id && !player.inventory.includes(id)) delete player.equippedMountId;
        if (player.equippedArmourId === id && !player.inventory.includes(id)) delete player.equippedArmourId;
      }
    };
    removeItems(left, leftOffer.itemIds);
    removeItems(right, rightOffer.itemIds);
    left.inventory.push(...rightOffer.itemIds);
    right.inventory.push(...leftOffer.itemIds);

    left.coins = left.coins - leftOffer.coins + rightOffer.coins;
    right.coins = right.coins - rightOffer.coins + leftOffer.coins;
    const now = Date.now();
    if (leftOffer.coins || rightOffer.coins) {
      const leftNet = rightOffer.coins - leftOffer.coins;
      const rightNet = leftOffer.coins - rightOffer.coins;
      if (leftNet) left.coinHistory.push({ amount: leftNet, reason: "Player trade", createdAt: now });
      if (rightNet) right.coinHistory.push({ amount: rightNet, reason: "Player trade", createdAt: now });
      left.coinHistory = left.coinHistory.slice(-100);
      right.coinHistory = right.coinHistory.slice(-100);
    }
  });
}
