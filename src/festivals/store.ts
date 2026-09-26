import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const festivalThemeSchema = z.enum(["autumn", "winter", "spring", "midsummer", "custom"]);
export type FestivalTheme = z.infer<typeof festivalThemeSchema>;

export const festivalActivitySchema = z.enum(["duel", "hunt", "tavern", "race", "expedition", "joust", "melee"]);
export type FestivalActivity = z.infer<typeof festivalActivitySchema>;

const objectiveSchema = z.object({
  id: z.string(),
  label: z.string(),
  activity: festivalActivitySchema,
  target: z.number().int().positive(),
  points: z.number().int().positive(),
  tokens: z.number().int().min(0),
});
export type FestivalObjective = z.infer<typeof objectiveSchema>;

const participantSchema = z.object({
  userId: z.string(),
  joinedAt: z.number().int().positive(),
  points: z.number().int().min(0).default(0),
  tokens: z.number().int().min(0).default(0),
  progress: z.record(z.string(), z.number().int().min(0)).default({}),
  completedObjectiveIds: z.array(z.string()).default([]),
});
export type FestivalParticipant = z.infer<typeof participantSchema>;

export const festivalSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  theme: festivalThemeSchema,
  description: z.string().max(1500).optional(),
  hostId: z.string(),
  status: z.enum(["draft", "open", "finished", "cancelled"]),
  startsAt: z.number().int().positive().optional(),
  endsAt: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  publishedAt: z.number().int().positive().optional(),
  finishedAt: z.number().int().positive().optional(),
  announcementChannelId: z.string().optional(),
  announcementMessageId: z.string().optional(),
  participants: z.record(z.string(), participantSchema).default({}),
  attendingDragonIds: z.array(z.number().int().positive()).default([]),
  podiumIds: z.array(z.string()).max(3).default([]),
  objectives: z.array(objectiveSchema).default([]),
});
export type Festival = z.infer<typeof festivalSchema>;

export const festivalGuildBackupSchema = z.object({
  nextFestivalId: z.number().int().positive().default(1),
  festivals: z.record(z.string(), festivalSchema).default({}),
});
export type FestivalGuild = z.infer<typeof festivalGuildBackupSchema>;

export const FESTIVAL_SHOP = [
  { id: "autumn-saddlecloth", name: "Autumn Saddlecloth", cost: 10, description: "A red-gold saddlecloth embroidered with falling leaves." },
  { id: "gilded-antler-brooch", name: "Gilded Antler Brooch", cost: 15, description: "A small gilded brooch shaped like branching antlers." },
  { id: "red-gold-riding-cloak", name: "Red-Gold Riding Cloak", cost: 20, description: "A riding cloak in the colours of turning leaves." },
  { id: "harvest-tourney-favor", name: "Harvest Tourney Favor", cost: 25, description: "A keepsake favour from the lists." },
  { id: "engraved-harvest-goblet", name: "Engraved Harvest Goblet", cost: 30, description: "A commemorative goblet from the autumn feast." },
  { id: "gilded-bridle-rosette", name: "Gilded Bridle Rosette", cost: 20, description: "A decorative rosette for a favored horse." },
  { id: "bronze-leaf-pommel", name: "Bronze Leaf Sword-Pommel", cost: 35, description: "A bronze leaf-shaped ornament for a named weapon." },
] as const;

const DEFAULT_OBJECTIVES: FestivalObjective[] = [
  { id: "duels-2", label: "Complete 2 duels", activity: "duel", target: 2, points: 4, tokens: 3 },
  { id: "hunt-1", label: "Complete a hunt", activity: "hunt", target: 1, points: 3, tokens: 2 },
  { id: "tavern-win-1", label: "Win a tavern game", activity: "tavern", target: 1, points: 2, tokens: 2 },
  { id: "race-1", label: "Finish a horse race", activity: "race", target: 1, points: 5, tokens: 4 },
  { id: "expedition-1", label: "Return from an expedition", activity: "expedition", target: 1, points: 5, tokens: 4 },
  { id: "joust-1", label: "Participate in a joust", activity: "joust", target: 1, points: 5, tokens: 4 },
  { id: "melee-1", label: "Participate in a grand melee", activity: "melee", target: 1, points: 5, tokens: 4 },
];

const fileSchema = z.record(z.string(), festivalGuildBackupSchema);
const filePath = resolve(process.cwd(), "data", "festivals.json");
let cache: Record<string, FestivalGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, FestivalGuild>> {
  if (cache) return cache;
  try { cache = fileSchema.parse(JSON.parse(await readFile(filePath, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}
async function persist(): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(tmp, filePath);
}
async function mutate<T>(fn: (data: Record<string, FestivalGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => { result = await fn(await load()); await persist(); });
  await writeQueue;
  return result;
}
function guildOf(data: Record<string, FestivalGuild>, guildId: string): FestivalGuild {
  return (data[guildId] ??= { nextFestivalId: 1, festivals: {} });
}

export async function createFestival(guildId: string, input: { name: string; theme: FestivalTheme; description?: string; hostId: string }): Promise<Festival> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const id = guild.nextFestivalId++;
    const festival = festivalSchema.parse({ id, ...input, status: "draft", createdAt: Date.now(), participants: {}, objectives: DEFAULT_OBJECTIVES });
    guild.festivals[String(id)] = festival;
    return festival;
  });
}
export async function getFestival(guildId: string, festivalId: number): Promise<Festival | undefined> {
  return (await load())[guildId]?.festivals[String(festivalId)];
}
export async function listFestivals(guildId: string): Promise<Festival[]> {
  return Object.values((await load())[guildId]?.festivals ?? {}).sort((a, b) => b.id - a.id);
}
export async function getActiveFestival(guildId: string): Promise<Festival | undefined> {
  return Object.values((await load())[guildId]?.festivals ?? {}).find((f) => f.status === "open" && (!f.endsAt || f.endsAt > Date.now()));
}
export async function publishFestival(guildId: string, festivalId: number, input: { durationDays: number; announcementChannelId: string; messageId?: string }): Promise<Festival> {
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(festivalId)];
    if (!festival) throw new Error("FESTIVAL_NOT_FOUND");
    if (festival.status !== "draft") throw new Error("FESTIVAL_NOT_DRAFT");
    const now = Date.now();
    festival.status = "open"; festival.startsAt = now; festival.endsAt = now + input.durationDays * 86_400_000; festival.publishedAt = now; festival.announcementChannelId = input.announcementChannelId; festival.announcementMessageId = input.messageId;
    return festivalSchema.parse(festival);
  });
}
export async function setFestivalAnnouncementMessage(guildId: string, festivalId: number, messageId: string): Promise<void> {
  await mutate((data) => { const festival = guildOf(data, guildId).festivals[String(festivalId)]; if (festival) festival.announcementMessageId = messageId; });
}
export async function joinFestival(guildId: string, festivalId: number, userId: string): Promise<Festival> {
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(festivalId)];
    if (!festival || festival.status !== "open" || (festival.endsAt && festival.endsAt <= Date.now())) throw new Error("FESTIVAL_NOT_OPEN");
    festival.participants[userId] ??= participantSchema.parse({ userId, joinedAt: Date.now() });
    return festivalSchema.parse(festival);
  });
}
export async function addFestivalDragon(guildId: string, festivalId: number, dragonId: number): Promise<Festival> {
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(festivalId)];
    if (!festival || festival.status !== "open" || (festival.endsAt && festival.endsAt <= Date.now())) throw new Error("FESTIVAL_NOT_OPEN");
    if (!festival.attendingDragonIds.includes(dragonId)) festival.attendingDragonIds.push(dragonId);
    return festivalSchema.parse(festival);
  });
}
export async function recordFestivalActivity(guildId: string, userId: string, activity: FestivalActivity, count = 1): Promise<{ awardedPoints: number; awardedTokens: number; completed: FestivalObjective[] }> {
  const active = await getActiveFestival(guildId);
  if (!active || !active.participants[userId]) return { awardedPoints: 0, awardedTokens: 0, completed: [] };
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(active.id)]!;
    const participant = festival.participants[userId]!;
    let awardedPoints = 0, awardedTokens = 0;
    const completed: FestivalObjective[] = [];
    for (const objective of festival.objectives.filter((o) => o.activity === activity)) {
      if (participant.completedObjectiveIds.includes(objective.id)) continue;
      const next = (participant.progress[objective.id] ?? 0) + count;
      participant.progress[objective.id] = Math.min(next, objective.target);
      if (next >= objective.target) {
        participant.completedObjectiveIds.push(objective.id);
        participant.points += objective.points;
        participant.tokens += objective.tokens;
        awardedPoints += objective.points; awardedTokens += objective.tokens; completed.push(objective);
      }
    }
    return { awardedPoints, awardedTokens, completed };
  });
}
export async function awardFestivalPlacement(guildId: string, userId: string, points: number, tokens: number): Promise<void> {
  const active = await getActiveFestival(guildId);
  if (!active || !active.participants[userId]) return;
  await mutate((data) => { const p = guildOf(data, guildId).festivals[String(active.id)]?.participants[userId]; if (p) { p.points += points; p.tokens += tokens; } });
}
export async function spendFestivalTokens(guildId: string, festivalId: number, userId: string, amount: number): Promise<FestivalParticipant> {
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(festivalId)];
    if (!festival || festival.status !== "open" || (festival.endsAt && festival.endsAt <= Date.now())) throw new Error("FESTIVAL_NOT_OPEN");
    const participant = festival.participants[userId];
    if (!participant) throw new Error("NOT_IN_FESTIVAL");
    if (participant.tokens < amount) throw new Error("NOT_ENOUGH_FESTIVAL_TOKENS");
    participant.tokens -= amount;
    return participantSchema.parse(participant);
  });
}
export async function finishFestival(guildId: string, festivalId: number): Promise<{ festival: Festival; podiumIds: string[] }> {
  return mutate((data) => {
    const festival = guildOf(data, guildId).festivals[String(festivalId)];
    if (!festival || festival.status !== "open") throw new Error("FESTIVAL_NOT_OPEN");
    const ranked = Object.values(festival.participants).sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt);
    festival.podiumIds = ranked.slice(0, 3).map((p) => p.userId);
    festival.status = "finished"; festival.finishedAt = Date.now();
    return { festival: festivalSchema.parse(festival), podiumIds: [...festival.podiumIds] };
  });
}
export async function cancelFestival(guildId: string, festivalId: number): Promise<Festival> {
  return mutate((data) => { const festival = guildOf(data, guildId).festivals[String(festivalId)]; if (!festival) throw new Error("FESTIVAL_NOT_FOUND"); if (festival.status === "finished") throw new Error("FESTIVAL_FINISHED"); festival.status = "cancelled"; return festivalSchema.parse(festival); });
}
export async function exportGuildFestivals(guildId: string): Promise<FestivalGuild> {
  return festivalGuildBackupSchema.parse((await load())[guildId] ?? { nextFestivalId: 1, festivals: {} });
}
export async function replaceGuildFestivals(guildId: string, value: unknown): Promise<void> {
  await mutate((data) => { data[guildId] = festivalGuildBackupSchema.parse(value); });
}
