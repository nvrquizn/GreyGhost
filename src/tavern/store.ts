import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const gameStatsSchema = z.object({
  played: z.number().int().min(0).default(0),
  won: z.number().int().min(0).default(0),
  best: z.number().int().min(0).default(0),
});

const tavernPlayerSchema = z.object({
  dice: gameStatsSchema.default({ played: 0, won: 0, best: 0 }),
  darts: gameStatsSchema.default({ played: 0, won: 0, best: 0 }),
  cups: gameStatsSchema.default({ played: 0, won: 0, best: 0 }),
  lastPlayedAt: z.record(z.string(), z.number().int().positive()).default({}),
  rewardDay: z.string().optional(),
  rewardsToday: z.number().int().min(0).default(0),
  lifetimeCoinsWon: z.number().int().min(0).default(0),
});

export const tavernGuildBackupSchema = z.object({
  players: z.record(z.string(), tavernPlayerSchema).default({}),
});

const tavernFileSchema = z.record(z.string(), tavernGuildBackupSchema);
export type TavernGuild = z.infer<typeof tavernGuildBackupSchema>;
export type TavernGame = "dice" | "darts" | "cups";

const filePath = resolve(process.cwd(), "data", "tavern.json");
let cache: Record<string, TavernGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, TavernGuild>> {
  if (cache) return cache;
  try {
    cache = tavernFileSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const data = await load();
  const temp = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temp, filePath);
}

async function mutate<T>(fn: (data: Record<string, TavernGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function freshPlayer() {
  return tavernPlayerSchema.parse({});
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export const TAVERN_COOLDOWN_MS = 30 * 60 * 1000;
export const TAVERN_DAILY_COIN_CAP = 6;

export async function tavernReadyAt(guildId: string, userId: string, game: TavernGame): Promise<number | undefined> {
  const last = (await load())[guildId]?.players[userId]?.lastPlayedAt[game];
  return last ? last + TAVERN_COOLDOWN_MS : undefined;
}

export async function recordTavernGame(
  guildId: string,
  userId: string,
  game: TavernGame,
  won: boolean,
  score: number,
  requestedReward: number,
  now = Date.now(),
): Promise<{ reward: number; stats: z.infer<typeof gameStatsSchema>; rewardsToday: number; lifetimeCoinsWon: number }> {
  return mutate((data) => {
    const guild = (data[guildId] ??= { players: {} });
    const player = (guild.players[userId] ??= freshPlayer());
    const last = player.lastPlayedAt[game];
    if (last && now - last < TAVERN_COOLDOWN_MS) {
      const error = new Error("TAVERN_COOLDOWN") as Error & { readyAt?: number };
      error.readyAt = last + TAVERN_COOLDOWN_MS;
      throw error;
    }

    const today = dayKey(now);
    if (player.rewardDay !== today) {
      player.rewardDay = today;
      player.rewardsToday = 0;
    }

    player.lastPlayedAt[game] = now;
    const stats = player[game];
    stats.played += 1;
    if (won) stats.won += 1;
    stats.best = Math.max(stats.best, Math.max(0, Math.floor(score)));

    const remaining = Math.max(0, TAVERN_DAILY_COIN_CAP - player.rewardsToday);
    const reward = won ? Math.min(Math.max(0, Math.floor(requestedReward)), remaining) : 0;
    player.rewardsToday += reward;
    player.lifetimeCoinsWon += reward;

    return { reward, stats: { ...stats }, rewardsToday: player.rewardsToday, lifetimeCoinsWon: player.lifetimeCoinsWon };
  });
}

export async function getTavernPlayer(guildId: string, userId: string) {
  return (await load())[guildId]?.players[userId];
}

export async function exportGuildTavern(guildId: string): Promise<TavernGuild> {
  return tavernGuildBackupSchema.parse((await load())[guildId] ?? { players: {} });
}

export async function replaceGuildTavern(guildId: string, guild: TavernGuild): Promise<void> {
  await mutate((data) => {
    data[guildId] = tavernGuildBackupSchema.parse(guild);
  });
}
