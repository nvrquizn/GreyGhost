import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { shopItemMap } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";

export const horseStatSchema = z.enum(["speed", "stamina", "agility"]);
export type HorseStat = z.infer<typeof horseStatSchema>;

export const horseProfileSchema = z.object({
  mountId: z.string(),
  name: z.string().min(1).max(40),
  coat: z.string().max(60).default("Unrecorded"),
  sex: z.string().max(30).default("Unrecorded"),
  temperament: z.string().max(80).default("Unrecorded"),
  speed: z.number().int().min(0).max(100).default(0),
  stamina: z.number().int().min(0).max(100).default(0),
  agility: z.number().int().min(0).max(100).default(0),
  bond: z.number().int().min(0).max(100).default(0),
  races: z.number().int().min(0).default(0),
  wins: z.number().int().min(0).default(0),
  hunts: z.number().int().min(0).default(0),
  lastTrainingDay: z.string().optional(),
  createdAt: z.number().int().positive(),
});

export const raceTypeSchema = z.enum(["sprint", "distance", "cross_country", "grand"]);
export type RaceType = z.infer<typeof raceTypeSchema>;

const raceEntrantSchema = z.object({
  userId: z.string(),
  mountId: z.string(),
  joinedAt: z.number().int().positive(),
  score: z.number().optional(),
  place: z.number().int().positive().optional(),
});

export const horseRaceSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(100),
  type: raceTypeSchema,
  hostId: z.string(),
  channelId: z.string(),
  status: z.enum(["draft", "lobby", "finished", "cancelled"]),
  entrants: z.record(z.string(), raceEntrantSchema).default({}),
  createdAt: z.number().int().positive(),
  publishedAt: z.number().int().positive().optional(),
  finishedAt: z.number().int().positive().optional(),
});
export type HorseRace = z.infer<typeof horseRaceSchema>;

const huntStatsSchema = z.object({
  completed: z.number().int().min(0).default(0),
  successes: z.number().int().min(0).default(0),
  lastHuntAt: z.number().int().positive().optional(),
});

export const stableGuildBackupSchema = z.object({
  nextRaceId: z.number().int().positive().default(1),
  horses: z.record(z.string(), z.record(z.string(), horseProfileSchema)).default({}),
  races: z.record(z.string(), horseRaceSchema).default({}),
  hunts: z.record(z.string(), huntStatsSchema).default({}),
});
export type StableGuild = z.infer<typeof stableGuildBackupSchema>;
export type HorseProfile = z.infer<typeof horseProfileSchema>;

const stableFileSchema = z.record(z.string(), stableGuildBackupSchema);
const stablePath = resolve(process.cwd(), "data", "stables.json");
let cache: Record<string, StableGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, StableGuild>> {
  if (cache) return cache;
  try { cache = stableFileSchema.parse(JSON.parse(await readFile(stablePath, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const temp = `${stablePath}.tmp`;
  await mkdir(dirname(stablePath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(temp, stablePath);
}

async function mutate<T>(fn: (data: Record<string, StableGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => { result = await fn(await load()); await persist(); });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, StableGuild>, guildId: string): StableGuild {
  return (data[guildId] ??= { nextRaceId: 1, horses: {}, races: {}, hunts: {} });
}

function defaultHorseName(mountId: string): string {
  return shopItemMap.get(mountId)?.name ?? "Horse";
}

async function ownsMount(guildId: string, userId: string, mountId: string): Promise<boolean> {
  const player = await getEconomyPlayer(guildId, userId);
  return Boolean(player?.inventory.includes(mountId) && shopItemMap.get(mountId)?.category === "mount");
}

export async function getHorseProfiles(guildId: string, userId: string): Promise<HorseProfile[]> {
  const player = await getEconomyPlayer(guildId, userId);
  if (!player) return [];
  const mountIds = [...new Set(player.inventory.filter((id) => shopItemMap.get(id)?.category === "mount"))];
  const guild = (await load())[guildId];
  return mountIds.map((mountId) => guild?.horses[userId]?.[mountId] ?? horseProfileSchema.parse({ mountId, name: defaultHorseName(mountId), createdAt: Date.now() }));
}

export async function getHorseProfile(guildId: string, userId: string, mountId: string): Promise<HorseProfile | undefined> {
  if (!(await ownsMount(guildId, userId, mountId))) return undefined;
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const userHorses = (guild.horses[userId] ??= {});
    return (userHorses[mountId] ??= horseProfileSchema.parse({ mountId, name: defaultHorseName(mountId), createdAt: Date.now() }));
  });
}

export async function customizeHorse(guildId: string, userId: string, mountId: string, changes: { name?: string; coat?: string; sex?: string; temperament?: string }): Promise<HorseProfile> {
  if (!(await ownsMount(guildId, userId, mountId))) throw new Error("HORSE_NOT_OWNED");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const userHorses = (guild.horses[userId] ??= {});
    const current = userHorses[mountId] ?? horseProfileSchema.parse({ mountId, name: defaultHorseName(mountId), createdAt: Date.now() });
    const updated = horseProfileSchema.parse({ ...current, ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) });
    userHorses[mountId] = updated;
    return updated;
  });
}

function utcDay(now = Date.now()): string { return new Date(now).toISOString().slice(0, 10); }

export async function trainHorse(guildId: string, userId: string, mountId: string, stat: HorseStat, now = Date.now()): Promise<HorseProfile> {
  if (!(await ownsMount(guildId, userId, mountId))) throw new Error("HORSE_NOT_OWNED");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const userHorses = (guild.horses[userId] ??= {});
    const horse = (userHorses[mountId] ??= horseProfileSchema.parse({ mountId, name: defaultHorseName(mountId), createdAt: now }));
    const day = utcDay(now);
    if (horse.lastTrainingDay === day) throw new Error("HORSE_TRAINED_TODAY");
    horse[stat] = Math.min(100, horse[stat] + 1);
    horse.bond = Math.min(100, horse.bond + 1);
    horse.lastTrainingDay = day;
    return horseProfileSchema.parse(horse);
  });
}

export async function createRace(guildId: string, input: { title: string; type: RaceType; hostId: string; channelId: string }): Promise<HorseRace> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const id = guild.nextRaceId++;
    const race = horseRaceSchema.parse({ id, ...input, status: "draft", entrants: {}, createdAt: Date.now() });
    guild.races[String(id)] = race;
    return race;
  });
}

export async function getRace(guildId: string, raceId: number): Promise<HorseRace | undefined> {
  return (await load())[guildId]?.races[String(raceId)];
}

export async function publishRace(guildId: string, raceId: number, channelId: string): Promise<HorseRace> {
  return mutate((data) => {
    const race = guildOf(data, guildId).races[String(raceId)];
    if (!race) throw new Error("RACE_NOT_FOUND");
    if (race.status !== "draft") throw new Error("RACE_NOT_DRAFT");
    race.status = "lobby"; race.channelId = channelId; race.publishedAt = Date.now();
    return horseRaceSchema.parse(race);
  });
}

export async function enterRace(guildId: string, raceId: number, userId: string, mountId: string): Promise<HorseRace> {
  if (!(await ownsMount(guildId, userId, mountId))) throw new Error("HORSE_NOT_OWNED");
  await getHorseProfile(guildId, userId, mountId);
  return mutate((data) => {
    const race = guildOf(data, guildId).races[String(raceId)];
    if (!race || race.status !== "lobby") throw new Error("RACE_NOT_OPEN");
    race.entrants[userId] = { userId, mountId, joinedAt: Date.now() };
    return horseRaceSchema.parse(race);
  });
}

function raceScore(type: RaceType, horse: HorseProfile, tier: number): number {
  const stat = type === "sprint" ? horse.speed * 1.7 + horse.agility * 0.5
    : type === "distance" ? horse.stamina * 1.7 + horse.speed * 0.4
    : type === "cross_country" ? horse.stamina + horse.agility * 1.3 + horse.speed * 0.4
    : horse.speed + horse.stamina + horse.agility;
  return stat + horse.bond * 0.25 + tier * 5 + Math.random() * 18;
}

export async function resolveRace(guildId: string, raceId: number): Promise<{ race: HorseRace; podiumIds: string[] }> {
  const source = await getRace(guildId, raceId);
  if (!source || source.status !== "lobby") throw new Error("RACE_NOT_OPEN");
  if (Object.keys(source.entrants).length < 2) throw new Error("NOT_ENOUGH_RACERS");
  const scored: Array<{ userId: string; mountId: string; score: number }> = [];
  for (const entrant of Object.values(source.entrants)) {
    const horse = await getHorseProfile(guildId, entrant.userId, entrant.mountId);
    if (!horse) continue;
    const tier = shopItemMap.get(entrant.mountId)?.tier ?? 1;
    scored.push({ userId: entrant.userId, mountId: entrant.mountId, score: raceScore(source.type, horse, tier) });
  }
  scored.sort((a, b) => b.score - a.score);
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const race = guild.races[String(raceId)];
    if (!race) throw new Error("RACE_NOT_FOUND");
    scored.forEach((entry, index) => {
      const entrant = race.entrants[entry.userId];
      if (entrant) { entrant.score = Math.round(entry.score * 10) / 10; entrant.place = index + 1; }
      const horse = guild.horses[entry.userId]?.[entry.mountId];
      if (horse) {
        horse.races += 1;
        horse.bond = Math.min(100, horse.bond + 1);
        if (index === 0) horse.wins += 1;
      }
    });
    race.status = "finished"; race.finishedAt = Date.now();
    return { race: horseRaceSchema.parse(race), podiumIds: scored.slice(0, 3).map((entry) => entry.userId) };
  });
}

export async function cancelRace(guildId: string, raceId: number): Promise<HorseRace> {
  return mutate((data) => {
    const race = guildOf(data, guildId).races[String(raceId)];
    if (!race) throw new Error("RACE_NOT_FOUND");
    if (race.status === "finished") throw new Error("RACE_FINISHED");
    race.status = "cancelled";
    return horseRaceSchema.parse(race);
  });
}

export async function getHuntStats(guildId: string, userId: string) {
  return (await load())[guildId]?.hunts[userId] ?? huntStatsSchema.parse({});
}

export async function recordHunt(guildId: string, userId: string, success: boolean, mountId?: string, now = Date.now()) {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const stats = (guild.hunts[userId] ??= huntStatsSchema.parse({}));
    if (stats.lastHuntAt && now - stats.lastHuntAt < 12 * 60 * 60 * 1000) {
      const error = new Error("HUNT_COOLDOWN") as Error & { readyAt?: number };
      error.readyAt = stats.lastHuntAt + 12 * 60 * 60 * 1000;
      throw error;
    }
    stats.completed += 1;
    if (success) stats.successes += 1;
    stats.lastHuntAt = now;
    if (mountId) {
      const horse = guild.horses[userId]?.[mountId];
      if (horse) { horse.hunts += 1; horse.bond = Math.min(100, horse.bond + 1); horse.stamina = Math.min(100, horse.stamina + (success ? 1 : 0)); }
    }
    return huntStatsSchema.parse(stats);
  });
}

export async function exportGuildStables(guildId: string): Promise<StableGuild> {
  return stableGuildBackupSchema.parse((await load())[guildId] ?? { nextRaceId: 1, horses: {}, races: {}, hunts: {} });
}

export async function replaceGuildStables(guildId: string, value: unknown): Promise<void> {
  const parsed = stableGuildBackupSchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}
