import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const dragonStageSchema = z.enum(["hatchling", "young", "small", "medium", "large", "very_large", "great", "ancient"]);
export const dragonStatusSchema = z.enum(["bonded", "wild", "deceased"]);

const activityCountsSchema = z.object({
  interactions: z.number().int().min(0).default(0),
  trainings: z.number().int().min(0).default(0),
  flights: z.number().int().min(0).default(0),
  patrols: z.number().int().min(0).default(0),
  hunts: z.number().int().min(0).default(0),
  events: z.number().int().min(0).default(0),
});

const dragonHistorySchema = z.object({
  at: z.number().int().positive(),
  text: z.string().min(1).max(500),
});

export const dragonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(60),
  sex: z.string().min(1).max(30),
  primaryColor: z.string().min(1).max(60),
  secondaryColor: z.string().max(60).optional(),
  wingColor: z.string().max(60).optional(),
  eyeColor: z.string().min(1).max(60),
  flameColor: z.string().max(60).optional(),
  hornColor: z.string().max(60).optional(),
  traits: z.array(z.string().min(1).max(40)).max(3).default([]),
  description: z.string().max(1000).optional(),
  status: dragonStatusSchema,
  riderId: z.string().optional(),
  formerRiderIds: z.array(z.string()).max(50).default([]),
  createdAt: z.number().int().positive(),
  bondedAt: z.number().int().positive().optional(),
  wildAt: z.number().int().positive().optional(),
  fedDays: z.number().int().min(0).default(0),
  lastFedDay: z.string().optional(),
  activityCounts: activityCountsSchema.default({
    interactions: 0,
    trainings: 0,
    flights: 0,
    patrols: 0,
    hunts: 0,
    events: 0,
  }),
  lastActivityDay: z.record(z.string(), z.string()).default({}),
  history: z.array(dragonHistorySchema).max(1000).default([]),
});

export const dragonGuildBackupSchema = z.object({
  nextDragonNumber: z.number().int().positive().default(1),
  dragons: z.record(z.string(), dragonSchema).default({}),
});

const dragonFileSchema = z.record(z.string(), dragonGuildBackupSchema);

export type Dragon = z.infer<typeof dragonSchema>;
export type DragonStage = z.infer<typeof dragonStageSchema>;
export type DragonGuild = z.infer<typeof dragonGuildBackupSchema>;

export const DRAGON_GROWTH: ReadonlyArray<{ stage: DragonStage; ageDays: number; fedDays: number }> = [
  { stage: "hatchling", ageDays: 0, fedDays: 0 },
  { stage: "young", ageDays: 15, fedDays: 15 },
  { stage: "small", ageDays: 40, fedDays: 40 },
  { stage: "medium", ageDays: 80, fedDays: 80 },
  { stage: "large", ageDays: 140, fedDays: 140 },
  { stage: "very_large", ageDays: 230, fedDays: 230 },
  { stage: "great", ageDays: 365, fedDays: 365 },
  { stage: "ancient", ageDays: 730, fedDays: 730 },
] as const;

const dragonPath = resolve(process.cwd(), "data", "dragons.json");
let cache: Record<string, DragonGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, DragonGuild>> {
  if (cache) return cache;
  try {
    cache = dragonFileSchema.parse(JSON.parse(await readFile(dragonPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const temp = `${dragonPath}.tmp`;
  await mkdir(dirname(dragonPath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(temp, dragonPath);
}

async function mutate<T>(fn: (data: Record<string, DragonGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, DragonGuild>, guildId: string): DragonGuild {
  return (data[guildId] ??= { nextDragonNumber: 1, dragons: {} });
}

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function dragonAgeDays(dragon: Dragon, now = Date.now()): number {
  return Math.max(0, Math.floor((now - dragon.createdAt) / 86_400_000));
}

export function dragonStage(dragon: Dragon, now = Date.now()): DragonStage {
  const age = dragonAgeDays(dragon, now);
  let stage: DragonStage = "hatchling";
  for (const threshold of DRAGON_GROWTH) {
    if (age >= threshold.ageDays && dragon.fedDays >= threshold.fedDays) stage = threshold.stage;
  }
  return stage;
}

export function nextDragonGrowth(dragon: Dragon, now = Date.now()) {
  const current = dragonStage(dragon, now);
  const index = DRAGON_GROWTH.findIndex((entry) => entry.stage === current);
  return DRAGON_GROWTH[index + 1];
}

export async function createDragon(guildId: string, input: {
  name: string;
  riderId: string;
  sex: string;
  primaryColor: string;
  secondaryColor?: string;
  wingColor?: string;
  eyeColor: string;
  flameColor?: string;
  hornColor?: string;
  traits?: string[];
  description?: string;
}): Promise<Dragon> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    if (Object.values(guild.dragons).some((dragon) => dragon.name.toLowerCase() === input.name.trim().toLowerCase())) throw new Error("DRAGON_NAME_TAKEN");
    if (Object.values(guild.dragons).some((dragon) => dragon.status === "bonded" && dragon.riderId === input.riderId)) throw new Error("RIDER_ALREADY_BONDED");
    const id = guild.nextDragonNumber++;
    const now = Date.now();
    const dragon = dragonSchema.parse({
      id,
      ...input,
      name: input.name.trim(),
      status: "bonded",
      riderId: input.riderId,
      formerRiderIds: [],
      createdAt: now,
      bondedAt: now,
      fedDays: 0,
      activityCounts: {},
      lastActivityDay: {},
      history: [{ at: now, text: `Bonded to <@${input.riderId}>.` }],
    });
    guild.dragons[String(id)] = dragon;
    return dragon;
  });
}

export async function getDragon(guildId: string, dragonId: number): Promise<Dragon | undefined> {
  return (await load())[guildId]?.dragons[String(dragonId)];
}

export async function getDragons(guildId: string): Promise<Dragon[]> {
  return Object.values((await load())[guildId]?.dragons ?? {}).sort((a, b) => a.id - b.id);
}

export async function findDragonByName(guildId: string, name: string): Promise<Dragon | undefined> {
  const wanted = name.trim().toLowerCase();
  return (await getDragons(guildId)).find((dragon) => dragon.name.toLowerCase() === wanted);
}

export async function getRiderDragon(guildId: string, riderId: string): Promise<Dragon | undefined> {
  return (await getDragons(guildId)).find((dragon) => dragon.status === "bonded" && dragon.riderId === riderId);
}

export async function feedDragon(guildId: string, dragonId: number, now = Date.now()): Promise<{ dragon: Dragon; grew: boolean; alreadyFed: boolean }> {
  return mutate((data) => {
    const dragon = guildOf(data, guildId).dragons[String(dragonId)];
    if (!dragon) throw new Error("DRAGON_NOT_FOUND");
    if (dragon.status !== "bonded") throw new Error("DRAGON_NOT_BONDED");
    const before = dragonStage(dragon, now);
    const day = utcDay(now);
    if (dragon.lastFedDay === day) return { dragon: dragonSchema.parse(dragon), grew: false, alreadyFed: true };
    dragon.lastFedDay = day;
    dragon.fedDays += 1;
    const after = dragonStage(dragon, now);
    dragon.history.push({ at: now, text: `Fed by <@${dragon.riderId}>.` });
    if (after !== before) dragon.history.push({ at: now, text: `Grew from ${before.replace("_", " ")} to ${after.replace("_", " ")}.` });
    return { dragon: dragonSchema.parse(dragon), grew: after !== before, alreadyFed: false };
  });
}

export async function recordDragonActivity(
  guildId: string,
  dragonId: number,
  activity: "interactions" | "trainings" | "flights" | "patrols" | "hunts" | "events",
  historyText: string,
  now = Date.now(),
): Promise<Dragon> {
  return mutate((data) => {
    const dragon = guildOf(data, guildId).dragons[String(dragonId)];
    if (!dragon) throw new Error("DRAGON_NOT_FOUND");
    if (dragon.status !== "bonded") throw new Error("DRAGON_NOT_BONDED");
    const day = utcDay(now);
    if (activity !== "interactions" && dragon.lastActivityDay[activity] === day) throw new Error("DRAGON_ACTIVITY_USED_TODAY");
    dragon.activityCounts[activity] += 1;
    dragon.lastActivityDay[activity] = day;
    dragon.history.push({ at: now, text: historyText });
    return dragonSchema.parse(dragon);
  });
}

export async function retireDragon(guildId: string, dragonId: number, reason = "The rider's service as a Dragonrider ended."): Promise<Dragon> {
  return mutate((data) => {
    const dragon = guildOf(data, guildId).dragons[String(dragonId)];
    if (!dragon) throw new Error("DRAGON_NOT_FOUND");
    if (dragon.status !== "bonded" || !dragon.riderId) return dragonSchema.parse(dragon);
    const riderId = dragon.riderId;
    if (!dragon.formerRiderIds.includes(riderId)) dragon.formerRiderIds.push(riderId);
    dragon.status = "wild";
    dragon.wildAt = Date.now();
    delete dragon.riderId;
    dragon.history.push({ at: Date.now(), text: `${reason} <@${riderId}> became the dragon's final rider; the dragon is now wild.` });
    return dragonSchema.parse(dragon);
  });
}

export async function retireRiderDragons(guildId: string, riderId: string): Promise<Dragon[]> {
  const bonded = (await getDragons(guildId)).filter((dragon) => dragon.status === "bonded" && dragon.riderId === riderId);
  const retired: Dragon[] = [];
  for (const dragon of bonded) retired.push(await retireDragon(guildId, dragon.id));
  return retired;
}

export async function editDragon(guildId: string, dragonId: number, changes: Partial<Pick<Dragon, "name" | "sex" | "primaryColor" | "secondaryColor" | "wingColor" | "eyeColor" | "flameColor" | "hornColor" | "traits" | "description">>): Promise<Dragon> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const dragon = guild.dragons[String(dragonId)];
    if (!dragon) throw new Error("DRAGON_NOT_FOUND");
    if (changes.name && Object.values(guild.dragons).some((other) => other.id !== dragonId && other.name.toLowerCase() === changes.name!.trim().toLowerCase())) throw new Error("DRAGON_NAME_TAKEN");
    const updated = dragonSchema.parse({ ...dragon, ...changes, name: changes.name?.trim() ?? dragon.name });
    guild.dragons[String(dragonId)] = updated;
    return updated;
  });
}

export async function recordDragonEncounter(guildId: string, leftId: number, rightId: number, text: string): Promise<{ left: Dragon; right: Dragon }> {
  if (leftId === rightId) throw new Error("SAME_DRAGON");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const left = guild.dragons[String(leftId)];
    const right = guild.dragons[String(rightId)];
    if (!left || !right) throw new Error("DRAGON_NOT_FOUND");
    if (left.status !== "bonded" || right.status !== "bonded") throw new Error("DRAGON_NOT_BONDED");
    const now = Date.now();
    left.activityCounts.interactions += 1;
    right.activityCounts.interactions += 1;
    left.history.push({ at: now, text });
    right.history.push({ at: now, text });
    return { left: dragonSchema.parse(left), right: dragonSchema.parse(right) };
  });
}

export async function exportGuildDragons(guildId: string): Promise<DragonGuild> {
  return dragonGuildBackupSchema.parse((await load())[guildId] ?? { nextDragonNumber: 1, dragons: {} });
}

export async function replaceGuildDragons(guildId: string, value: unknown): Promise<void> {
  const parsed = dragonGuildBackupSchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}
