import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { countInventoryItem, shopItemMap } from "../economy/catalogue.js";
import { getEconomyPlayer } from "../economy/store.js";

export const expeditionChoiceSchema = z.enum(["bold", "cautious", "clever"]);
export const expeditionDifficultySchema = z.enum(["easy", "standard", "perilous"]);

const participantSchema = z.object({
  userId: z.string(),
  joinedAt: z.number().int().positive(),
});

const stageResultSchema = z.object({
  stage: z.number().int().min(1).max(4),
  choice: expeditionChoiceSchema,
  success: z.boolean(),
  score: z.number().int(),
  target: z.number().int(),
  roll: z.number().int().min(1).max(6),
});

const expeditionSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(100),
  hostId: z.string(),
  channelId: z.string(),
  statusMessageId: z.string().optional(),
  difficulty: expeditionDifficultySchema,
  status: z.enum(["lobby", "active", "finished"]),
  participants: z.record(z.string(), participantSchema),
  stage: z.number().int().min(0).max(4),
  votes: z.record(z.string(), expeditionChoiceSchema).default({}),
  history: z.array(stageResultSchema).max(4),
  successes: z.number().int().min(0).max(4),
  createdAt: z.number().int().positive(),
  finishedAt: z.number().int().positive().optional(),
});

export const expeditionGuildBackupSchema = z.object({
  nextExpeditionNumber: z.number().int().positive().default(1),
  expeditions: z.record(z.string(), expeditionSchema).default({}),
});

const expeditionFileSchema = z.record(z.string(), expeditionGuildBackupSchema);

export type Expedition = z.infer<typeof expeditionSchema>;
export type ExpeditionChoice = z.infer<typeof expeditionChoiceSchema>;
export type ExpeditionDifficulty = z.infer<typeof expeditionDifficultySchema>;
export type ExpeditionStageResult = z.infer<typeof stageResultSchema>;
export type ExpeditionGuild = z.infer<typeof expeditionGuildBackupSchema>;

const expeditionPath = resolve(process.cwd(), "data", "expeditions.json");
let cache: Record<string, ExpeditionGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, ExpeditionGuild>> {
  if (cache) return cache;
  try {
    cache = expeditionFileSchema.parse(JSON.parse(await readFile(expeditionPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const temp = `${expeditionPath}.tmp`;
  await mkdir(dirname(expeditionPath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(temp, expeditionPath);
}

async function mutate<T>(fn: (data: Record<string, ExpeditionGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    result = await fn(await load());
    await persist();
  });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, ExpeditionGuild>, guildId: string): ExpeditionGuild {
  return (data[guildId] ??= { nextExpeditionNumber: 1, expeditions: {} });
}

export async function createExpedition(
  guildId: string,
  input: { title: string; hostId: string; channelId: string; difficulty: ExpeditionDifficulty },
): Promise<Expedition> {
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const id = guild.nextExpeditionNumber++;
    const expedition = expeditionSchema.parse({
      id,
      title: input.title.trim(),
      hostId: input.hostId,
      channelId: input.channelId,
      difficulty: input.difficulty,
      status: "lobby",
      participants: {},
      stage: 0,
      votes: {},
      history: [],
      successes: 0,
      createdAt: Date.now(),
    });
    guild.expeditions[String(id)] = expedition;
    return expedition;
  });
}


export async function setExpeditionStatusMessage(guildId: string, expeditionId: number, messageId: string): Promise<Expedition> {
  return mutate((data) => {
    const expedition = guildOf(data, guildId).expeditions[String(expeditionId)];
    if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
    expedition.statusMessageId = messageId;
    return expeditionSchema.parse(expedition);
  });
}

export async function getExpedition(guildId: string, expeditionId: number): Promise<Expedition | undefined> {
  return (await load())[guildId]?.expeditions[String(expeditionId)];
}

export async function joinExpedition(guildId: string, expeditionId: number, userId: string): Promise<Expedition> {
  if (!await getEconomyPlayer(guildId, userId)) throw new Error("CHARACTER_REQUIRED");
  return mutate((data) => {
    const expedition = guildOf(data, guildId).expeditions[String(expeditionId)];
    if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
    if (expedition.status !== "lobby") throw new Error("EXPEDITION_NOT_OPEN");
    expedition.participants[userId] ??= { userId, joinedAt: Date.now() };
    return expeditionSchema.parse(expedition);
  });
}

export async function leaveExpedition(guildId: string, expeditionId: number, userId: string): Promise<Expedition> {
  return mutate((data) => {
    const expedition = guildOf(data, guildId).expeditions[String(expeditionId)];
    if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
    if (expedition.status !== "lobby") throw new Error("EXPEDITION_ALREADY_STARTED");
    delete expedition.participants[userId];
    return expeditionSchema.parse(expedition);
  });
}

export async function chooseExpedition(
  guildId: string,
  expeditionId: number,
  userId: string,
  choice: ExpeditionChoice,
): Promise<Expedition> {
  return mutate((data) => {
    const expedition = guildOf(data, guildId).expeditions[String(expeditionId)];
    if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
    if (expedition.status !== "active") throw new Error("EXPEDITION_NOT_ACTIVE");
    if (!expedition.participants[userId]) throw new Error("NOT_IN_EXPEDITION");
    expedition.votes[userId] = choice;
    return expeditionSchema.parse(expedition);
  });
}

function winningChoice(votes: Record<string, ExpeditionChoice>): ExpeditionChoice {
  const counts: Record<ExpeditionChoice, number> = { bold: 0, cautious: 0, clever: 0 };
  for (const choice of Object.values(votes)) counts[choice]++;
  return (Object.entries(counts) as Array<[ExpeditionChoice, number]>)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "cautious";
}

async function partyScore(guildId: string, expedition: Expedition, choice: ExpeditionChoice): Promise<number> {
  let total = 0;
  for (const participant of Object.values(expedition.participants)) {
    const player = await getEconomyPlayer(guildId, participant.userId);
    if (!player) continue;
    const mount = player.equippedMountId ? shopItemMap.get(player.equippedMountId) : undefined;
    const armour = player.equippedArmourId ? shopItemMap.get(player.equippedArmourId) : undefined;
    const supplies = Math.min(2, countInventoryItem(player.inventory, "field-bandage"));
    const trained = choice === "bold"
      ? player.character.damage
      : choice === "cautious"
        ? player.character.resistance
        : player.character.health;
    const gear = choice === "bold"
      ? (mount?.tier ?? 0)
      : choice === "cautious"
        ? (armour?.tier ?? 0)
        : Math.floor(((mount?.tier ?? 0) + (armour?.tier ?? 0)) / 2) + supplies;
    total += 5 + Math.min(4, trained) + Math.min(4, gear);
  }
  return total;
}

export async function continueExpedition(
  guildId: string,
  expeditionId: number,
  userId: string,
  random: () => number = Math.random,
): Promise<{ expedition: Expedition; result?: ExpeditionStageResult; started?: true }> {
  const current = await getExpedition(guildId, expeditionId);
  if (!current) throw new Error("EXPEDITION_NOT_FOUND");
  if (current.hostId !== userId) throw new Error("NOT_EXPEDITION_HOST");

  if (current.status === "lobby") {
    if (Object.keys(current.participants).length < 2) throw new Error("NOT_ENOUGH_EXPLORERS");
    const expedition = await mutate((data) => {
      const target = guildOf(data, guildId).expeditions[String(expeditionId)]!;
      target.status = "active";
      target.stage = 1;
      target.votes = {};
      return expeditionSchema.parse(target);
    });
    return { expedition, started: true };
  }

  if (current.status !== "active") throw new Error("EXPEDITION_FINISHED");
  if (Object.keys(current.votes).length === 0) throw new Error("NO_CHOICES");

  const choice = winningChoice(current.votes);
  const base = await partyScore(guildId, current, choice);
  const roll = 1 + Math.floor(random() * 6);
  const partySize = Object.keys(current.participants).length;
  const difficultyOffset = current.difficulty === "easy" ? 0 : current.difficulty === "standard" ? 3 : 6;
  const target = partySize * 5 + difficultyOffset + current.stage;
  const score = base + roll;
  const success = score >= target;

  const result = stageResultSchema.parse({ stage: current.stage, choice, success, score, target, roll });
  const expedition = await mutate((data) => {
    const targetExpedition = guildOf(data, guildId).expeditions[String(expeditionId)]!;
    targetExpedition.history.push(result);
    if (success) targetExpedition.successes++;
    targetExpedition.votes = {};
    if (targetExpedition.stage >= 4) {
      targetExpedition.status = "finished";
      targetExpedition.finishedAt = Date.now();
    } else {
      targetExpedition.stage++;
    }
    return expeditionSchema.parse(targetExpedition);
  });
  return { expedition, result };
}

export async function exportGuildExpeditions(guildId: string): Promise<ExpeditionGuild> {
  return expeditionGuildBackupSchema.parse((await load())[guildId] ?? { nextExpeditionNumber: 1, expeditions: {} });
}

export async function replaceGuildExpeditions(guildId: string, value: unknown): Promise<void> {
  const parsed = expeditionGuildBackupSchema.parse(value);
  await mutate((data) => {
    data[guildId] = parsed;
  });
}
