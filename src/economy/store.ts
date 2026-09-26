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

const characterSchema = z.object({
  name: z.string().min(1).max(40),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  health: z.number().int().min(0).max(1000).default(0),
  damage: z.number().int().min(0).max(1000).default(0),
  resistance: z.number().int().min(0).max(1000).default(0),
});

const playerSchema = z.object({
  character: characterSchema,
  coins: z.number().int().min(0).default(0),
  coinHistory: z.array(coinTransactionSchema).max(100).default([]),
  lastDailyAt: z.number().int().positive().optional(),
  lastTrainingAt: z.number().int().positive().optional(),
  inventory: z.array(z.string()).max(250).default([]),
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
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) throw new Error("INVALID_AMOUNT");
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

export async function exportGuildEconomy(guildId: string): Promise<EconomyGuild> {
  const current = (await load())[guildId] ?? { players: {} };
  return guildEconomySchema.parse(current);
}

export async function replaceGuildEconomy(guildId: string, value: unknown): Promise<void> {
  const parsed = guildEconomySchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}

export const economyGuildSchema = guildEconomySchema;
