import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { shopItemMap, type ShopCategory } from "../economy/catalogue.js";
import {
  getEconomyPlayer,
  takeSpoilsCoins,
  escrowBestItem,
  receiveTransferredItem,
  payRansom,
  injuryPenalty,
  completeDuelProgress,
  getDuelAllowance,
} from "../economy/store.js";


const duelSchema = z.object({
  id: z.number().int().positive(),
  challengerId: z.string(),
  opponentId: z.string(),
  status: z.enum(["pending", "completed", "declined", "cancelled"]),
  winnerId: z.string().optional(),
  loserId: z.string().optional(),
  challengerScore: z.number().int().optional(),
  opponentScore: z.number().int().optional(),
  createdAt: z.number().int().positive(),
  resolvedAt: z.number().int().positive().optional(),
});

const spoilChoiceSchema = z.enum(["coins", "mount", "armour"]);
const spoilClaimSchema = z.object({
  id: z.number().int().positive(),
  sourceKey: z.string().min(1).max(120),
  joustId: z.number().int().positive(),
  round: z.number().int().positive(),
  winnerId: z.string(),
  loserId: z.string(),
  status: z.enum(["pending", "ransom", "settled"]),
  choice: spoilChoiceSchema.optional(),
  coinAmount: z.number().int().min(0).optional(),
  itemId: z.string().optional(),
  ransomPrice: z.number().int().min(0).optional(),
  ransomDeadlineAt: z.number().int().positive().optional(),
  resolution: z.enum(["coins_taken", "ransomed", "equipment_transferred"]).optional(),
  createdAt: z.number().int().positive(),
  settledAt: z.number().int().positive().optional(),
});

const meleeEntrantSchema = z.object({
  userId: z.string(),
  houseRoleId: z.string(),
  active: z.boolean(),
  wins: z.number().int().min(0),
});

const meleeMatchSchema = z.object({
  round: z.number().int().positive(),
  leftId: z.string(),
  rightId: z.string(),
  winnerId: z.string(),
  loserId: z.string(),
  leftScore: z.number().int(),
  rightScore: z.number().int(),
});

const meleeSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(100),
  hostId: z.string(),
  channelId: z.string(),
  status: z.enum(["draft", "lobby", "active", "finished", "cancelled"]),
  entrants: z.record(z.string(), meleeEntrantSchema),
  matches: z.array(meleeMatchSchema).max(2000),
  round: z.number().int().min(0),
  championId: z.string().optional(),
  createdAt: z.number().int().positive(),
});

const combatGuildSchema = z.object({
  nextDuelNumber: z.number().int().positive().default(1),
  duels: z.record(z.string(), duelSchema).default({}),
  nextSpoilNumber: z.number().int().positive().default(1),
  spoils: z.record(z.string(), spoilClaimSchema).default({}),
  nextMeleeNumber: z.number().int().positive().default(1),
  melees: z.record(z.string(), meleeSchema).default({}),
});

const combatFileSchema = z.record(z.string(), combatGuildSchema);

export type Duel = z.infer<typeof duelSchema>;
export type SpoilClaim = z.infer<typeof spoilClaimSchema>;
export type SpoilChoice = z.infer<typeof spoilChoiceSchema>;
export type Melee = z.infer<typeof meleeSchema>;
export type MeleeMatch = z.infer<typeof meleeMatchSchema>;
export type CombatGuild = z.infer<typeof combatGuildSchema>;

const combatPath = resolve(process.cwd(), "data", "combat.json");
let cache: Record<string, CombatGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, CombatGuild>> {
  if (cache) return cache;
  try {
    cache = combatFileSchema.parse(JSON.parse(await readFile(combatPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const temp = `${combatPath}.tmp`;
  await mkdir(dirname(combatPath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(temp, combatPath);
}

async function mutate<T>(fn: (data: Record<string, CombatGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, CombatGuild>, guildId: string): CombatGuild {
  return (data[guildId] ??= { nextDuelNumber: 1, duels: {}, nextSpoilNumber: 1, spoils: {}, nextMeleeNumber: 1, melees: {} });
}


export async function challengeDuel(guildId: string, challengerId: string, opponentId: string): Promise<Duel> {
  if (challengerId === opponentId) throw new Error("DUEL_SELF");
  await getDuelAllowance(guildId, challengerId);
  await getDuelAllowance(guildId, opponentId);
  if (!(await getEconomyPlayer(guildId, challengerId)) || !(await getEconomyPlayer(guildId, opponentId))) throw new Error("CHARACTER_REQUIRED");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const existing = Object.values(guild.duels).find((duel) => duel.status === "pending" && ((duel.challengerId === challengerId && duel.opponentId === opponentId) || (duel.challengerId === opponentId && duel.opponentId === challengerId)));
    if (existing) throw new Error("DUEL_PENDING_EXISTS");
    const id = guild.nextDuelNumber++;
    const duel = duelSchema.parse({ id, challengerId, opponentId, status: "pending", createdAt: Date.now() });
    guild.duels[String(id)] = duel;
    return duel;
  });
}

export async function getDuel(guildId: string, duelId: number): Promise<Duel | undefined> {
  return (await load())[guildId]?.duels[String(duelId)];
}

export async function listMemberDuels(guildId: string, userId: string): Promise<Duel[]> {
  return Object.values((await load())[guildId]?.duels ?? {}).filter((duel) => duel.challengerId === userId || duel.opponentId === userId).sort((a, b) => b.id - a.id);
}

export async function declineDuel(guildId: string, duelId: number, userId: string): Promise<Duel> {
  return mutate((data) => {
    const duel = guildOf(data, guildId).duels[String(duelId)];
    if (!duel) throw new Error("DUEL_NOT_FOUND");
    if (duel.opponentId !== userId) throw new Error("DUEL_NOT_OPPONENT");
    if (duel.status !== "pending") throw new Error("DUEL_NOT_PENDING");
    duel.status = "declined";
    duel.resolvedAt = Date.now();
    return duelSchema.parse(duel);
  });
}

export async function cancelDuel(guildId: string, duelId: number, userId: string): Promise<Duel> {
  return mutate((data) => {
    const duel = guildOf(data, guildId).duels[String(duelId)];
    if (!duel) throw new Error("DUEL_NOT_FOUND");
    if (duel.challengerId !== userId) throw new Error("DUEL_NOT_CHALLENGER");
    if (duel.status !== "pending") throw new Error("DUEL_NOT_PENDING");
    duel.status = "cancelled";
    duel.resolvedAt = Date.now();
    return duelSchema.parse(duel);
  });
}

async function duelScore(guildId: string, userId: string, random: () => number): Promise<number> {
  const player = await getEconomyPlayer(guildId, userId);
  if (!player) throw new Error("CHARACTER_REQUIRED");
  const armour = player.equippedArmourId ? shopItemMap.get(player.equippedArmourId) : undefined;
  const training = player.character.health + player.character.damage + player.character.resistance;
  const gear = (armour?.bonuses?.health ?? 0) + (armour?.bonuses?.damage ?? 0) + (armour?.bonuses?.resistance ?? 0);
  return 1 + Math.floor(random() * 20) + training + gear - injuryPenalty(player.injury?.severity);
}

export async function acceptDuel(guildId: string, duelId: number, userId: string, random: () => number = Math.random): Promise<{ duel: Duel; winnerStat: string; loserStat: string }> {
  const current = await getDuel(guildId, duelId);
  if (!current) throw new Error("DUEL_NOT_FOUND");
  if (current.opponentId !== userId) throw new Error("DUEL_NOT_OPPONENT");
  if (current.status !== "pending") throw new Error("DUEL_NOT_PENDING");
  const challengerAllowance = await getDuelAllowance(guildId, current.challengerId);
  const opponentAllowance = await getDuelAllowance(guildId, current.opponentId);
  if (!challengerAllowance.remaining || !opponentAllowance.remaining) throw new Error("DUEL_WEEK_LIMIT");
  let challengerScore = await duelScore(guildId, current.challengerId, random);
  let opponentScore = await duelScore(guildId, current.opponentId, random);
  if (challengerScore === opponentScore) (random() < 0.5 ? challengerScore++ : opponentScore++);
  const winnerId = challengerScore > opponentScore ? current.challengerId : current.opponentId;
  const loserId = winnerId === current.challengerId ? current.opponentId : current.challengerId;
  const progress = await completeDuelProgress(guildId, winnerId, loserId, random);
  const duel = await mutate((data) => {
    const entry = guildOf(data, guildId).duels[String(duelId)]!;
    entry.status = "completed";
    entry.winnerId = winnerId;
    entry.loserId = loserId;
    entry.challengerScore = challengerScore;
    entry.opponentScore = opponentScore;
    entry.resolvedAt = Date.now();
    return duelSchema.parse(entry);
  });
  return { duel, winnerStat: progress.winnerStat, loserStat: progress.loserStat };
}

export async function createJoustSpoilClaim(
  guildId: string,
  input: { joustId: number; round: number; winnerId: string; loserId: string },
): Promise<SpoilClaim> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const sourceKey = `joust:${input.joustId}:round:${input.round}:${input.winnerId}:${input.loserId}`;
    const existing = Object.values(guild.spoils).find((claim) => claim.sourceKey === sourceKey);
    if (existing) return existing;
    const id = guild.nextSpoilNumber++;
    const claim = spoilClaimSchema.parse({ id, sourceKey, ...input, status: "pending", createdAt: Date.now() });
    guild.spoils[String(id)] = claim;
    return claim;
  });
}

export async function getSpoilClaim(guildId: string, claimId: number): Promise<SpoilClaim | undefined> {
  return (await load())[guildId]?.spoils[String(claimId)];
}

export async function getMemberSpoils(guildId: string, userId: string): Promise<SpoilClaim[]> {
  await settleExpiredSpoils(guildId);
  return Object.values((await load())[guildId]?.spoils ?? {})
    .filter((claim) => claim.winnerId === userId || claim.loserId === userId)
    .sort((a, b) => b.id - a.id);
}

export async function claimSpoil(guildId: string, claimId: number, userId: string, choice: SpoilChoice): Promise<SpoilClaim> {
  const current = await getSpoilClaim(guildId, claimId);
  if (!current) throw new Error("SPOIL_NOT_FOUND");
  if (current.winnerId !== userId) throw new Error("SPOIL_NOT_WINNER");
  if (current.status !== "pending") throw new Error("SPOIL_ALREADY_CLAIMED");

  if (choice === "coins") {
    const amount = await takeSpoilsCoins(guildId, current.winnerId, current.loserId, 50);
    return mutate((data) => {
      const claim = guildOf(data, guildId).spoils[String(claimId)]!;
      claim.status = "settled";
      claim.choice = "coins";
      claim.coinAmount = amount;
      claim.resolution = "coins_taken";
      claim.settledAt = Date.now();
      return spoilClaimSchema.parse(claim);
    });
  }

  const item = await escrowBestItem(guildId, current.loserId, choice as Extract<ShopCategory, "mount" | "armour">);
  const ransomPrice = Math.ceil(item.price * 0.75);
  return mutate((data) => {
    const claim = guildOf(data, guildId).spoils[String(claimId)]!;
    claim.status = "ransom";
    claim.choice = choice;
    claim.itemId = item.id;
    claim.ransomPrice = ransomPrice;
    claim.ransomDeadlineAt = Date.now() + 48 * 60 * 60 * 1000;
    return spoilClaimSchema.parse(claim);
  });
}

export async function ransomSpoil(guildId: string, claimId: number, userId: string): Promise<SpoilClaim> {
  await settleExpiredSpoils(guildId);
  const current = await getSpoilClaim(guildId, claimId);
  if (!current) throw new Error("SPOIL_NOT_FOUND");
  if (current.loserId !== userId) throw new Error("SPOIL_NOT_LOSER");
  if (current.status !== "ransom" || !current.itemId || current.ransomPrice === undefined) throw new Error("SPOIL_NOT_RANSOMABLE");
  await payRansom(guildId, current.loserId, current.winnerId, current.ransomPrice, current.itemId);
  return mutate((data) => {
    const claim = guildOf(data, guildId).spoils[String(claimId)]!;
    claim.status = "settled";
    claim.resolution = "ransomed";
    claim.settledAt = Date.now();
    return spoilClaimSchema.parse(claim);
  });
}

export async function settleExpiredSpoils(guildId: string, now = Date.now()): Promise<SpoilClaim[]> {
  const guild = (await load())[guildId];
  if (!guild) return [];
  const expired = Object.values(guild.spoils).filter((claim) => claim.status === "ransom" && claim.ransomDeadlineAt !== undefined && claim.ransomDeadlineAt <= now && claim.itemId);
  const settled: SpoilClaim[] = [];
  for (const claim of expired) {
    await receiveTransferredItem(guildId, claim.winnerId, claim.itemId!);
    settled.push(await mutate((data) => {
      const current = guildOf(data, guildId).spoils[String(claim.id)]!;
      current.status = "settled";
      current.resolution = "equipment_transferred";
      current.settledAt = now;
      return spoilClaimSchema.parse(current);
    }));
  }
  return settled;
}

export async function createMelee(guildId: string, input: { title: string; hostId: string; channelId: string }): Promise<Melee> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const id = guild.nextMeleeNumber++;
    const melee = meleeSchema.parse({ ...input, id, status: "draft", entrants: {}, matches: [], round: 0, createdAt: Date.now() });
    guild.melees[String(id)] = melee;
    return melee;
  });
}

export async function publishMelee(guildId: string, meleeId: number): Promise<Melee> {
  return mutate((data) => {
    const melee = guildOf(data, guildId).melees[String(meleeId)];
    if (!melee) throw new Error("MELEE_NOT_FOUND");
    if (melee.status !== "draft") throw new Error("MELEE_NOT_DRAFT");
    melee.status = "lobby";
    return meleeSchema.parse(melee);
  });
}

export async function getMelee(guildId: string, meleeId: number): Promise<Melee | undefined> {
  return (await load())[guildId]?.melees[String(meleeId)];
}

export async function enterMelee(guildId: string, meleeId: number, userId: string, houseRoleId: string): Promise<Melee> {
  if (!(await getEconomyPlayer(guildId, userId))) throw new Error("CHARACTER_REQUIRED");
  return mutate((data) => {
    const melee = guildOf(data, guildId).melees[String(meleeId)];
    if (!melee) throw new Error("MELEE_NOT_FOUND");
    if (melee.status !== "lobby") throw new Error("MELEE_NOT_OPEN");
    melee.entrants[userId] = meleeEntrantSchema.parse({ userId, houseRoleId, active: true, wins: 0 });
    return meleeSchema.parse(melee);
  });
}

export async function startMelee(guildId: string, meleeId: number): Promise<Melee> {
  return mutate((data) => {
    const melee = guildOf(data, guildId).melees[String(meleeId)];
    if (!melee) throw new Error("MELEE_NOT_FOUND");
    if (melee.status !== "lobby") throw new Error("MELEE_NOT_OPEN");
    if (Object.keys(melee.entrants).length < 2) throw new Error("NOT_ENOUGH_MELEE_ENTRANTS");
    melee.status = "active";
    return meleeSchema.parse(melee);
  });
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

async function meleeScore(guildId: string, userId: string, random: () => number): Promise<number> {
  const player = await getEconomyPlayer(guildId, userId);
  if (!player) return Math.floor(random() * 20) + 1;
  const armour = player.equippedArmourId ? shopItemMap.get(player.equippedArmourId) : undefined;
  const trained = player.character.health + player.character.damage + player.character.resistance;
  const armourBonus = (armour?.bonuses?.health ?? 0) + (armour?.bonuses?.damage ?? 0) + (armour?.bonuses?.resistance ?? 0);
  return 1 + Math.floor(random() * 20) + trained + armourBonus - injuryPenalty(player.injury?.severity);
}

export async function resolveMeleeRound(guildId: string, meleeId: number, random: () => number = Math.random): Promise<{ melee: Melee; matches: MeleeMatch[]; byes: string[] }> {
  const melee = await getMelee(guildId, meleeId);
  if (!melee || melee.status !== "active") throw new Error("MELEE_NOT_ACTIVE");
  const active = shuffle(Object.values(melee.entrants).filter((entrant) => entrant.active), random);
  if (active.length <= 1) throw new Error("MELEE_ALREADY_DECIDED");
  const round = melee.round + 1;
  const matches: MeleeMatch[] = [];
  const byes: string[] = [];
  const results = new Map<string, { active?: boolean; wins?: number }>();

  for (let index = 0; index < active.length; index += 2) {
    const left = active[index]!;
    const right = active[index + 1];
    if (!right) { byes.push(left.userId); continue; }
    let leftScore = await meleeScore(guildId, left.userId, random);
    let rightScore = await meleeScore(guildId, right.userId, random);
    if (leftScore === rightScore) (random() < 0.5 ? leftScore++ : rightScore++);
    const winner = leftScore > rightScore ? left : right;
    const loser = winner.userId === left.userId ? right : left;
    results.set(loser.userId, { active: false });
    results.set(winner.userId, { wins: winner.wins + 1 });
    matches.push(meleeMatchSchema.parse({ round, leftId: left.userId, rightId: right.userId, winnerId: winner.userId, loserId: loser.userId, leftScore, rightScore }));
  }

  return mutate((data) => {
    const current = guildOf(data, guildId).melees[String(meleeId)]!;
    for (const [userId, changes] of results) {
      if (changes.active !== undefined) current.entrants[userId]!.active = changes.active;
      if (changes.wins !== undefined) current.entrants[userId]!.wins = changes.wins;
    }
    current.round = round;
    current.matches.push(...matches);
    const survivors = Object.values(current.entrants).filter((entrant) => entrant.active);
    if (survivors.length === 1) {
      current.status = "finished";
      current.championId = survivors[0]!.userId;
    }
    return { melee: meleeSchema.parse(current), matches, byes };
  });
}

export async function cancelMelee(guildId: string, meleeId: number): Promise<Melee> {
  return mutate((data) => {
    const melee = guildOf(data, guildId).melees[String(meleeId)];
    if (!melee) throw new Error("MELEE_NOT_FOUND");
    if (melee.status === "finished") throw new Error("MELEE_ALREADY_FINISHED");
    melee.status = "cancelled";
    return meleeSchema.parse(melee);
  });
}

export async function exportGuildCombat(guildId: string): Promise<CombatGuild> {
  return combatGuildSchema.parse((await load())[guildId] ?? { nextDuelNumber: 1, duels: {}, nextSpoilNumber: 1, spoils: {}, nextMeleeNumber: 1, melees: {} });
}

export async function replaceGuildCombat(guildId: string, value: unknown): Promise<void> {
  const parsed = combatGuildSchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}

export const combatGuildBackupSchema = combatGuildSchema;
