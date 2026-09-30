import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const LEVEL_THRESHOLDS = [1, 5, 10, 25, 50, 75, 100] as const;
export type LevelThreshold = typeof LEVEL_THRESHOLDS[number];

const levelMemberSchema = z.object({
  xp: z.number().int().min(0).default(0),
  lastAwardAt: z.number().int().positive().optional(),
});

export const levelGuildSchema = z.object({
  members: z.record(z.string(), levelMemberSchema).default({}),
  excludedRoleIds: z.array(z.string()).max(100).default([]),
  roleIds: z.record(z.string(), z.string()).default({}),
});

const levelFileSchema = z.record(z.string(), levelGuildSchema);
export type LevelGuild = z.infer<typeof levelGuildSchema>;
export type LevelMember = z.infer<typeof levelMemberSchema>;

const filePath = resolve(process.cwd(), "data", "levels.json");
let cache: Record<string, LevelGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, LevelGuild>> {
  if (cache) return cache;
  try {
    cache = levelFileSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
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

async function mutate<T>(fn: (data: Record<string, LevelGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, LevelGuild>, guildId: string): LevelGuild {
  return (data[guildId] ??= { members: {}, excludedRoleIds: [], roleIds: {} });
}

function memberOf(guild: LevelGuild, userId: string): LevelMember {
  return (guild.members[userId] ??= { xp: 0 });
}

export function xpForLevel(level: number): number {
  const safe = Math.max(0, Math.floor(level));
  return 50 * safe * (safe + 1);
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  return Math.max(0, Math.floor((-1 + Math.sqrt(1 + (4 * safe) / 50)) / 2));
}

export function progressForXp(xp: number): { level: number; current: number; needed: number; totalForNext: number } {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - base, needed: next - base, totalForNext: next };
}

export async function getLevelGuild(guildId: string): Promise<LevelGuild> {
  const data = await load();
  return levelGuildSchema.parse(data[guildId] ?? { members: {}, excludedRoleIds: [], roleIds: {} });
}

export async function getLevelMember(guildId: string, userId: string): Promise<LevelMember> {
  const guild = await getLevelGuild(guildId);
  return guild.members[userId] ?? { xp: 0 };
}

export async function addXp(guildId: string, userId: string, amount: number): Promise<{ before: LevelMember; after: LevelMember }> {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("INVALID_XP");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const member = memberOf(guild, userId);
    const before = { ...member };
    member.xp += amount;
    member.lastAwardAt = Date.now();
    return { before, after: { ...member } };
  });
}

export async function takeXp(guildId: string, userId: string, amount: number): Promise<LevelMember> {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("INVALID_XP");
  return mutate((data) => {
    const member = memberOf(guildOf(data, guildId), userId);
    member.xp = Math.max(0, member.xp - amount);
    return { ...member };
  });
}

export async function resetXp(guildId: string, userId: string): Promise<LevelMember> {
  return mutate((data) => {
    const member = memberOf(guildOf(data, guildId), userId);
    member.xp = 0;
    delete member.lastAwardAt;
    return { ...member };
  });
}

export async function setRoleExcluded(guildId: string, roleId: string, excluded: boolean): Promise<LevelGuild> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const set = new Set(guild.excludedRoleIds);
    if (excluded) set.add(roleId); else set.delete(roleId);
    guild.excludedRoleIds = [...set];
    return levelGuildSchema.parse(guild);
  });
}

export async function setLevelRole(guildId: string, threshold: LevelThreshold, roleId?: string): Promise<LevelGuild> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    if (roleId) guild.roleIds[String(threshold)] = roleId;
    else delete guild.roleIds[String(threshold)];
    return levelGuildSchema.parse(guild);
  });
}

export async function levelLeaderboard(guildId: string, limit = 10): Promise<Array<{ userId: string; xp: number; level: number }>> {
  const guild = await getLevelGuild(guildId);
  return Object.entries(guild.members)
    .map(([userId, member]) => ({ userId, xp: member.xp, level: levelFromXp(member.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

export async function exportGuildLevels(guildId: string): Promise<LevelGuild> {
  return getLevelGuild(guildId);
}

export async function replaceGuildLevels(guildId: string, value: LevelGuild): Promise<void> {
  await mutate((data) => {
    data[guildId] = levelGuildSchema.parse(value);
  });
}
