import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  balanceJoustHouses,
  drawCrossHousePairings,
  simulateTilt,
  validJoustBuild,
} from "../jousts/engine.js";

const collectionSetSchema = z
  .object({
    name: z.string(),
    titleRoleId: z.string(),
    requirementRoleIds: z.array(z.string()).min(1).max(25),
    requiredCount: z.number().int().min(1).max(25),
  })
  .refine((set) => set.requiredCount <= set.requirementRoleIds.length, {
    message: "requiredCount cannot exceed the number of requirement roles",
  });

const memberProfileSchema = z.object({
  bio: z.string().max(300).optional(),
  favoriteCharacter: z.string().max(80).optional(),
  favoriteDragon: z.string().max(80).optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  wishlistRoleIds: z.array(z.string()).max(5).optional(),
  updatedAt: z.number(),
});

const memberInviteRecordSchema = z.object({
  source: z.enum(["invite", "vanity", "unknown"]),
  code: z.string().max(100).optional(),
  inviterId: z.string().optional(),
  joinedAt: z.number().int().positive(),
});

const housePointTransactionSchema = z.object({
  id: z.string(),
  houseRoleId: z.string(),
  delta: z.number().int().min(-1000).max(1000).refine((value) => value !== 0),
  reason: z.string().min(1).max(200),
  memberId: z.string().optional(),
  staffId: z.string(),
  createdAt: z.number(),
});

const housePointsSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(0)),
  transactions: z.array(housePointTransactionSchema).max(5000),
});

export const modmailTicketSchema = z.object({
  id: z.number().int().positive(),
  userId: z.string(),
  channelId: z.string(),
  headerMessageId: z.string().optional(),
  category: z.string().min(1).max(80),
  subject: z.string().min(1).max(100),
  status: z.enum(["open", "closed"]),
  claimedBy: z.string().optional(),
  openedAt: z.number(),
  closedAt: z.number().optional(),
  closedBy: z.string().optional(),
  closeReason: z.string().max(500).optional(),
});

const modmailSchema = z.object({
  categoryId: z.string(),
  staffRoleId: z.string(),
  logChannelId: z.string(),
  nextTicketNumber: z.number().int().positive().default(1),
  tickets: z.record(z.string(), modmailTicketSchema).default({}),
});

export const moderationActionSchema = z.enum([
  "warn",
  "strike",
  "timeout",
  "untimeout",
  "kick",
  "ban",
  "unban",
  "purge",
  "slowmode",
  "lock",
  "unlock",
]);

export const moderationNoteSchema = z.object({
  id: z.number().int().positive(),
  targetType: z.enum(["user", "case"]),
  targetId: z.string(),
  authorId: z.string(),
  content: z.string().min(1).max(1000),
  createdAt: z.number(),
});

export const moderationCaseSchema = z.object({
  id: z.number().int().positive(),
  action: moderationActionSchema,
  targetId: z.string(),
  targetTag: z.string().min(1).max(100),
  moderatorId: z.string(),
  reason: z.string().min(1).max(400),
  evidenceUrl: z.string().url().optional(),
  durationMs: z.number().int().positive().optional(),
  expiresAt: z.number().int().positive().optional(),
  dmDelivered: z.boolean(),
  createdAt: z.number(),
  status: z.enum(["active", "voided"]).default("active"),
  editedBy: z.string().optional(),
  editedAt: z.number().optional(),
  voidedBy: z.string().optional(),
  voidedAt: z.number().optional(),
  voidReason: z.string().max(400).optional(),
});

const moderationSchema = z.object({
  logChannelId: z.string(),
  nextCaseNumber: z.number().int().positive().default(1),
  cases: z.record(z.string(), moderationCaseSchema).default({}),
  nextNoteNumber: z.number().int().positive().default(1),
  notes: z.record(z.string(), moderationNoteSchema).default({}),
});

const quizQuestionSchema = z.object({
  prompt: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(200)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(1000).optional(),
});

const quizResponseSchema = z.object({
  choice: z.number().int().min(0).max(3),
  answeredAt: z.number(),
});

export const quizSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(100),
  hostId: z.string(),
  channelId: z.string(),
  status: z.enum(["draft", "lobby", "question", "results", "finished", "cancelled"]),
  secondsPerQuestion: z.number().int().min(10).max(120),
  questions: z.array(quizQuestionSchema).max(50),
  currentQuestion: z.number().int().min(-1),
  participants: z.array(z.string()).max(500),
  scores: z.record(z.string(), z.number().int().min(0)),
  currentResponses: z.record(z.string(), quizResponseSchema),
  questionStartedAt: z.number().optional(),
  questionEndsAt: z.number().optional(),
  lobbyMessageId: z.string().optional(),
  questionMessageId: z.string().optional(),
  createdAt: z.number(),
});

const quizzesSchema = z.object({
  nextQuizNumber: z.number().int().positive().default(1),
  entries: z.record(z.string(), quizSchema).default({}),
});

const joustEntrantSchema = z.object({
  userId: z.string(),
  horse: z.enum(["destrier", "courser"]),
  chosenHouseRoleId: z.string(),
  houseRoleId: z.string(),
  health: z.number().int().min(-3).max(8),
  damage: z.number().int().min(-3).max(8),
  resistance: z.number().int().min(-3).max(8),
  active: z.boolean(),
  wins: z.number().int().min(0),
}).refine((entrant) => validJoustBuild(entrant.health, entrant.damage, entrant.resistance), {
  message: "Joust stats must total 2 and remain between -3 and 8.",
});

const joustPassSchema = z.object({
  pass: z.number().int().min(1).max(3),
  leftAttack: z.number().int(),
  rightAttack: z.number().int(),
  leftGuard: z.number().int(),
  rightGuard: z.number().int(),
  leftRemaining: z.number().int(),
  rightRemaining: z.number().int(),
});

const joustMatchSchema = z.object({
  round: z.number().int().positive(),
  leftId: z.string(),
  rightId: z.string(),
  winnerId: z.string(),
  loserId: z.string(),
  houseRoleId: z.string(),
  passes: z.array(joustPassSchema).min(1).max(3),
  decidedBy: z.enum(["unhorsed", "endurance", "sudden-death"]),
});

export const joustSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(100),
  hostId: z.string(),
  channelId: z.string(),
  status: z.enum(["draft", "lobby", "active", "finished", "cancelled"]),
  entrants: z.record(z.string(), joustEntrantSchema),
  round: z.number().int().min(0),
  matches: z.array(joustMatchSchema).max(1000),
  championIds: z.array(z.string()).max(500),
  lobbyMessageId: z.string().optional(),
  createdAt: z.number(),
});

const joustsSchema = z.object({
  nextJoustNumber: z.number().int().positive().default(1),
  entries: z.record(z.string(), joustSchema).default({}),
});

export const loreEntryTypeSchema = z.enum(["house", "character", "dragon"]);

const loreFactSchema = z.object({
  label: z.string().min(1).max(50),
  value: z.string().min(1).max(300),
});

export const loreEntrySchema = z.object({
  id: z.string().min(1).max(100),
  type: loreEntryTypeSchema,
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().min(1).max(80)).max(10).default([]),
  overview: z.string().min(1).max(1000),
  spoilers: z.string().max(1500).optional(),
  spoilerLabel: z.enum(["General", "Books", "Game of Thrones", "House of the Dragon"]).optional(),
  facts: z.array(loreFactSchema).max(8).default([]),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  updatedBy: z.string().optional(),
  updatedAt: z.number().optional(),
});

export const guildSettingsSchema = z.object({
  welcomeChannelId: z.string().optional(),
  logChannelId: z.string().optional(),
  newcomerRoleId: z.string().optional(),
  suggestionChannelId: z.string().optional(),
  collectionAnnouncementChannelId: z.string().optional(),
  serverLogChannelId: z.string().optional(),
  // Kept for migration from v0.15.2. New configurations use serverLogChannelId.
  reactionLogChannelId: z.string().optional(),
  statsChannelId: z.string().optional(),
  statsMessageId: z.string().optional(),
  collectionSets: z.record(z.string(), collectionSetSchema).optional(),
  selfRolePanels: z
    .record(
      z.string(),
      z.object({
        title: z.string(),
        description: z.string(),
        mode: z.enum(["single", "multiple"]),
        roles: z.array(
          z.object({
            roleId: z.string(),
            emoji: z.string().optional(),
          }),
        ),
        channelId: z.string().optional(),
        messageId: z.string().optional(),
      }),
    )
    .optional(),
  memberProfiles: z.record(z.string(), memberProfileSchema).optional(),
  memberInviteRecords: z.record(z.string(), memberInviteRecordSchema).optional(),
  housePoints: housePointsSchema.optional(),
  loreEntries: z.record(z.string(), loreEntrySchema).optional(),
  hiddenLoreEntryIds: z.array(z.string()).max(500).optional(),
  modmail: modmailSchema.optional(),
  moderation: moderationSchema.optional(),
  quizzes: quizzesSchema.optional(),
  jousts: joustsSchema.optional(),
});

const settingsFileSchema = z.record(z.string(), guildSettingsSchema);

export type GuildSettings = z.infer<typeof guildSettingsSchema>;
export type SelfRolePanel = NonNullable<GuildSettings["selfRolePanels"]>[string];
export type CollectionSet = NonNullable<GuildSettings["collectionSets"]>[string];
export type MemberProfile = NonNullable<GuildSettings["memberProfiles"]>[string];
export type MemberInviteRecord = NonNullable<GuildSettings["memberInviteRecords"]>[string];
export type HousePoints = NonNullable<GuildSettings["housePoints"]>;
export type HousePointTransaction = HousePoints["transactions"][number];
export type LoreEntry = z.infer<typeof loreEntrySchema>;
export type LoreEntryType = z.infer<typeof loreEntryTypeSchema>;
export type ModmailTicket = z.infer<typeof modmailTicketSchema>;
export type ModerationCase = z.infer<typeof moderationCaseSchema>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;
export type ModerationNote = z.infer<typeof moderationNoteSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizQuestion = Quiz["questions"][number];
export type Joust = z.infer<typeof joustSchema>;
export type JoustEntrant = Joust["entrants"][string];
export type JoustMatch = Joust["matches"][number];

const settingsPath = resolve(process.cwd(), "data", "guild-settings.json");
let settingsCache: Record<string, GuildSettings> | undefined;
let writeQueue = Promise.resolve();

async function loadSettings(): Promise<Record<string, GuildSettings>> {
  if (settingsCache) return settingsCache;

  try {
    const contents = await readFile(settingsPath, "utf8");
    settingsCache = settingsFileSchema.parse(JSON.parse(contents));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    settingsCache = {};
  }

  return settingsCache;
}

async function saveSettings(): Promise<void> {
  const settings = await loadSettings();
  const temporaryPath = `${settingsPath}.tmp`;

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const settings = await loadSettings();
  return settings[guildId] ?? {};
}

export async function updateGuildSettings(
  guildId: string,
  changes: Partial<GuildSettings>,
): Promise<GuildSettings> {
  const settings = await loadSettings();
  settings[guildId] = { ...settings[guildId], ...changes };

  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;

  return settings[guildId];
}

export async function clearGuildSetting(
  guildId: string,
  target: keyof GuildSettings | "all",
): Promise<GuildSettings> {
  const settings = await loadSettings();

  if (target === "all") {
    const current = { ...settings[guildId] };
    delete current.welcomeChannelId;
    delete current.logChannelId;
    delete current.newcomerRoleId;
    delete current.suggestionChannelId;
    delete current.collectionAnnouncementChannelId;
    delete current.serverLogChannelId;
    delete current.reactionLogChannelId;
    delete current.statsChannelId;
    delete current.statsMessageId;
    settings[guildId] = current;
  } else {
    const current = { ...settings[guildId] };
    delete current[target];
    settings[guildId] = current;
  }

  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;

  return settings[guildId];
}

export async function getSelfRolePanel(
  guildId: string,
  panelId: string,
): Promise<SelfRolePanel | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.selfRolePanels?.[panelId];
}

export async function saveSelfRolePanel(
  guildId: string,
  panelId: string,
  panel: SelfRolePanel,
): Promise<SelfRolePanel> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId] ?? {};

  guildSettings.selfRolePanels = {
    ...guildSettings.selfRolePanels,
    [panelId]: panel,
  };
  settings[guildId] = guildSettings;

  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;

  return panel;
}

export async function clearSelfRolePanel(guildId: string, panelId: string): Promise<void> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId];

  if (guildSettings?.selfRolePanels) {
    delete guildSettings.selfRolePanels[panelId];
  }

  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
}

export async function saveMemberInviteRecord(
  guildId: string,
  memberId: string,
  record: MemberInviteRecord,
): Promise<void> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId] ?? {};
  guildSettings.memberInviteRecords = {
    ...guildSettings.memberInviteRecords,
    [memberId]: memberInviteRecordSchema.parse(record),
  };
  settings[guildId] = guildSettings;
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
}

export async function getMemberInviteRecord(
  guildId: string,
  memberId: string,
): Promise<MemberInviteRecord | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.memberInviteRecords?.[memberId];
}

export async function deleteMemberInviteRecord(guildId: string, memberId: string): Promise<void> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId];
  if (guildSettings?.memberInviteRecords) delete guildSettings.memberInviteRecords[memberId];
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
}

export async function getCollectionSets(guildId: string): Promise<CollectionSet[]> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.collectionSets ?? {});
}

export async function getCollectionSet(
  guildId: string,
  titleRoleId: string,
): Promise<CollectionSet | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.collectionSets?.[titleRoleId];
}

export async function saveCollectionSet(
  guildId: string,
  collectionSet: CollectionSet,
): Promise<CollectionSet> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId] ?? {};

  guildSettings.collectionSets = {
    ...guildSettings.collectionSets,
    [collectionSet.titleRoleId]: collectionSet,
  };
  settings[guildId] = guildSettings;

  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
  return collectionSet;
}

export async function deleteCollectionSet(
  guildId: string,
  titleRoleId: string,
): Promise<boolean> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId];

  if (!guildSettings?.collectionSets?.[titleRoleId]) return false;

  delete guildSettings.collectionSets[titleRoleId];
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
  return true;
}

export async function replaceGuildSettings(
  guildId: string,
  replacement: unknown,
): Promise<GuildSettings> {
  const settings = await loadSettings();
  const validated = guildSettingsSchema.parse(replacement);
  settings[guildId] = validated;
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
  return validated;
}

export async function getMemberProfile(
  guildId: string,
  userId: string,
): Promise<MemberProfile | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.memberProfiles?.[userId];
}

export async function saveMemberProfile(
  guildId: string,
  userId: string,
  changes: Partial<Omit<MemberProfile, "updatedAt">>,
): Promise<MemberProfile> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId] ?? {};
  const current = guildSettings.memberProfiles?.[userId];
  const profile = memberProfileSchema.parse({
    ...current,
    ...changes,
    updatedAt: Date.now(),
  });

  guildSettings.memberProfiles = {
    ...guildSettings.memberProfiles,
    [userId]: profile,
  };
  settings[guildId] = guildSettings;
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
  return profile;
}

export async function deleteMemberProfile(guildId: string, userId: string): Promise<boolean> {
  const settings = await loadSettings();
  const guildSettings = settings[guildId];
  if (!guildSettings?.memberProfiles?.[userId]) return false;

  delete guildSettings.memberProfiles[userId];
  writeQueue = writeQueue.then(saveSettings);
  await writeQueue;
  return true;
}

export async function getHousePoints(guildId: string): Promise<HousePoints> {
  const settings = await getGuildSettings(guildId);
  return settings.housePoints ?? { scores: {}, transactions: [] };
}

export async function changeHousePoints(
  guildId: string,
  change: {
    houseRoleId: string;
    delta: number;
    reason: string;
    memberId?: string;
    staffId: string;
  },
): Promise<{ transaction: HousePointTransaction; total: number }> {
  const transaction = housePointTransactionSchema.parse({
    id: randomBytes(4).toString("hex"),
    ...change,
    createdAt: Date.now(),
  });
  let result: { transaction: HousePointTransaction; total: number } | undefined;
  let insufficientPoints = false;

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    const state = guildSettings.housePoints ?? { scores: {}, transactions: [] };
    const current = state.scores[transaction.houseRoleId] ?? 0;
    const total = current + transaction.delta;
    if (total < 0) {
      insufficientPoints = true;
      return;
    }

    guildSettings.housePoints = housePointsSchema.parse({
      scores: { ...state.scores, [transaction.houseRoleId]: total },
      transactions: [...state.transactions, transaction].slice(-5000),
    });
    settings[guildId] = guildSettings;
    await saveSettings();
    result = { transaction, total };
  });
  await writeQueue;

  if (insufficientPoints) throw new Error("INSUFFICIENT_HOUSE_POINTS");
  if (!result) throw new Error("HOUSE_POINTS_UPDATE_FAILED");
  return result;
}

export async function saveLoreEntry(guildId: string, entry: LoreEntry): Promise<LoreEntry> {
  const validated = loreEntrySchema.parse(entry);
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    guildSettings.loreEntries = {
      ...guildSettings.loreEntries,
      [validated.id]: validated,
    };
    guildSettings.hiddenLoreEntryIds = (guildSettings.hiddenLoreEntryIds ?? []).filter(
      (id) => id !== validated.id,
    );
    settings[guildId] = guildSettings;
    await saveSettings();
  });
  await writeQueue;
  return validated;
}

export async function removeLoreEntry(
  guildId: string,
  entryId: string,
  hideStarter: boolean,
): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    if (guildSettings.loreEntries) delete guildSettings.loreEntries[entryId];
    const hidden = new Set(guildSettings.hiddenLoreEntryIds ?? []);
    if (hideStarter) hidden.add(entryId);
    else hidden.delete(entryId);
    guildSettings.hiddenLoreEntryIds = [...hidden];
    settings[guildId] = guildSettings;
    await saveSettings();
  });
  await writeQueue;
}

export async function createModmailTicket(
  guildId: string,
  input: Omit<ModmailTicket, "status" | "openedAt">,
): Promise<ModmailTicket> {
  let created: ModmailTicket | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    if (!guildSettings.modmail) throw new Error("MODMAIL_NOT_CONFIGURED");
    const alreadyOpen = Object.values(guildSettings.modmail.tickets).some(
      (ticket) => ticket.userId === input.userId && ticket.status === "open",
    );
    if (alreadyOpen) throw new Error("OPEN_TICKET_EXISTS");
    created = modmailTicketSchema.parse({
      ...input,
      status: "open",
      openedAt: Date.now(),
    });
    guildSettings.modmail = {
      ...guildSettings.modmail,
      tickets: { ...guildSettings.modmail.tickets, [String(created.id)]: created },
    };
    settings[guildId] = guildSettings;
    await saveSettings();
  });
  await writeQueue;
  if (!created) throw new Error("MODMAIL_CREATE_FAILED");
  return created;
}

export async function reserveModmailTicketNumber(guildId: string): Promise<number> {
  let reserved: number | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId];
    if (!guildSettings?.modmail) throw new Error("MODMAIL_NOT_CONFIGURED");
    reserved = guildSettings.modmail.nextTicketNumber;
    guildSettings.modmail.nextTicketNumber += 1;
    await saveSettings();
  });
  await writeQueue;
  if (!reserved) throw new Error("MODMAIL_RESERVATION_FAILED");
  return reserved;
}

export async function updateModmailTicket(
  guildId: string,
  ticketId: number,
  changes: Partial<ModmailTicket>,
): Promise<ModmailTicket | undefined> {
  let updated: ModmailTicket | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId];
    const current = guildSettings?.modmail?.tickets[String(ticketId)];
    if (!guildSettings?.modmail || !current) return;
    updated = modmailTicketSchema.parse({ ...current, ...changes, id: current.id });
    guildSettings.modmail.tickets[String(ticketId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function reserveModerationCaseNumber(guildId: string): Promise<number> {
  let reserved: number | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId];
    if (!guildSettings?.moderation) throw new Error("MODERATION_NOT_CONFIGURED");
    reserved = guildSettings.moderation.nextCaseNumber;
    guildSettings.moderation.nextCaseNumber += 1;
    await saveSettings();
  });
  await writeQueue;
  if (!reserved) throw new Error("MODERATION_RESERVATION_FAILED");
  return reserved;
}

export async function saveModerationCase(
  guildId: string,
  moderationCase: ModerationCase,
): Promise<ModerationCase> {
  const validated = moderationCaseSchema.parse(moderationCase);
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId];
    if (!guildSettings?.moderation) throw new Error("MODERATION_NOT_CONFIGURED");
    guildSettings.moderation.cases[String(validated.id)] = validated;
    const entries = Object.entries(guildSettings.moderation.cases)
      .sort(([, a], [, b]) => a.id - b.id)
      .slice(-5000);
    guildSettings.moderation.cases = Object.fromEntries(entries);
    await saveSettings();
  });
  await writeQueue;
  return validated;
}

export async function getModerationCase(
  guildId: string,
  caseId: number,
): Promise<ModerationCase | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.moderation?.cases[String(caseId)];
}

export async function getMemberModerationCases(
  guildId: string,
  userId: string,
): Promise<ModerationCase[]> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.moderation?.cases ?? {})
    .filter((moderationCase) => moderationCase.targetId === userId)
    .sort((a, b) => b.id - a.id);
}

export async function updateModerationCase(
  guildId: string,
  caseId: number,
  changes: Partial<ModerationCase>,
): Promise<ModerationCase | undefined> {
  let updated: ModerationCase | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const moderation = settings[guildId]?.moderation;
    const current = moderation?.cases[String(caseId)];
    if (!moderation || !current) return;
    updated = moderationCaseSchema.parse({ ...current, ...changes, id: current.id });
    moderation.cases[String(caseId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function clearMemberWarnings(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string,
): Promise<number> {
  let count = 0;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const moderation = settings[guildId]?.moderation;
    if (!moderation) throw new Error("MODERATION_NOT_CONFIGURED");
    for (const [id, entry] of Object.entries(moderation.cases)) {
      if (entry.targetId === userId && entry.action === "warn" && entry.status === "active") {
        moderation.cases[id] = moderationCaseSchema.parse({
          ...entry,
          status: "voided",
          voidedBy: moderatorId,
          voidedAt: Date.now(),
          voidReason: reason,
        });
        count += 1;
      }
    }
    await saveSettings();
  });
  await writeQueue;
  return count;
}

export async function addModerationNote(
  guildId: string,
  input: Omit<ModerationNote, "id" | "createdAt">,
): Promise<ModerationNote> {
  let note: ModerationNote | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const moderation = settings[guildId]?.moderation;
    if (!moderation) throw new Error("MODERATION_NOT_CONFIGURED");
    const id = moderation.nextNoteNumber;
    note = moderationNoteSchema.parse({ ...input, id, createdAt: Date.now() });
    moderation.nextNoteNumber += 1;
    moderation.notes[String(id)] = note;
    await saveSettings();
  });
  await writeQueue;
  if (!note) throw new Error("NOTE_CREATE_FAILED");
  return note;
}

export async function getModerationNotes(
  guildId: string,
  targetType: "user" | "case",
  targetId: string,
): Promise<ModerationNote[]> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.moderation?.notes ?? {})
    .filter((note) => note.targetType === targetType && note.targetId === targetId)
    .sort((a, b) => b.id - a.id);
}

export async function deleteModerationNote(guildId: string, noteId: number): Promise<ModerationNote | undefined> {
  let deleted: ModerationNote | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const notes = settings[guildId]?.moderation?.notes;
    if (!notes) return;
    deleted = notes[String(noteId)];
    if (deleted) delete notes[String(noteId)];
    await saveSettings();
  });
  await writeQueue;
  return deleted;
}

export async function createQuiz(
  guildId: string,
  input: Pick<Quiz, "title" | "hostId" | "channelId" | "secondsPerQuestion">,
): Promise<Quiz> {
  let created: Quiz | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    const quizzes = guildSettings.quizzes ?? { nextQuizNumber: 1, entries: {} };
    const id = quizzes.nextQuizNumber;
    created = quizSchema.parse({
      ...input,
      id,
      status: "draft",
      questions: [],
      currentQuestion: -1,
      participants: [],
      scores: {},
      currentResponses: {},
      createdAt: Date.now(),
    });
    quizzes.nextQuizNumber += 1;
    quizzes.entries[String(id)] = created;
    guildSettings.quizzes = quizzes;
    settings[guildId] = guildSettings;
    await saveSettings();
  });
  await writeQueue;
  if (!created) throw new Error("QUIZ_CREATE_FAILED");
  return created;
}

export async function getQuiz(guildId: string, quizId: number): Promise<Quiz | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.quizzes?.entries[String(quizId)];
}

export async function getGuildQuizzes(guildId: string): Promise<Quiz[]> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.quizzes?.entries ?? {}).sort((a, b) => b.id - a.id);
}

export async function updateQuiz(
  guildId: string,
  quizId: number,
  changes: Partial<Quiz>,
): Promise<Quiz | undefined> {
  let updated: Quiz | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const quiz = settings[guildId]?.quizzes?.entries[String(quizId)];
    if (!quiz) return;
    updated = quizSchema.parse({ ...quiz, ...changes, id: quiz.id });
    settings[guildId]!.quizzes!.entries[String(quizId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function addQuizQuestion(
  guildId: string,
  quizId: number,
  question: QuizQuestion,
): Promise<Quiz | undefined> {
  let updated: Quiz | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const quiz = settings[guildId]?.quizzes?.entries[String(quizId)];
    if (!quiz || quiz.status !== "draft" || quiz.questions.length >= 50) return;
    updated = quizSchema.parse({ ...quiz, questions: [...quiz.questions, question] });
    settings[guildId]!.quizzes!.entries[String(quizId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function joinQuiz(guildId: string, quizId: number, userId: string): Promise<Quiz | undefined> {
  let updated: Quiz | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const quiz = settings[guildId]?.quizzes?.entries[String(quizId)];
    if (!quiz || quiz.status !== "lobby") return;
    const participants = [...new Set([...quiz.participants, userId])];
    updated = quizSchema.parse({ ...quiz, participants, scores: { ...quiz.scores, [userId]: quiz.scores[userId] ?? 0 } });
    settings[guildId]!.quizzes!.entries[String(quizId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function recordQuizAnswer(
  guildId: string,
  quizId: number,
  userId: string,
  choice: number,
  answeredAt = Date.now(),
): Promise<"saved" | "not_joined" | "closed" | "missing"> {
  let result: "saved" | "not_joined" | "closed" | "missing" = "missing";
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const quiz = settings[guildId]?.quizzes?.entries[String(quizId)];
    if (!quiz) return;
    if (quiz.status !== "question" || !quiz.questionEndsAt || answeredAt > quiz.questionEndsAt) {
      result = "closed";
      return;
    }
    if (!quiz.participants.includes(userId)) {
      result = "not_joined";
      return;
    }
    quiz.currentResponses[userId] = quizResponseSchema.parse({ choice, answeredAt });
    await saveSettings();
    result = "saved";
  });
  await writeQueue;
  return result;
}

export async function closeQuizQuestion(
  guildId: string,
  quizId: number,
): Promise<{ quiz: Quiz; awarded: Record<string, number> } | undefined> {
  let result: { quiz: Quiz; awarded: Record<string, number> } | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const quiz = settings[guildId]?.quizzes?.entries[String(quizId)];
    if (!quiz || quiz.status !== "question" || quiz.currentQuestion < 0 || !quiz.questionStartedAt || !quiz.questionEndsAt) return;
    const question = quiz.questions[quiz.currentQuestion];
    if (!question) return;
    const duration = quiz.questionEndsAt - quiz.questionStartedAt;
    const awarded: Record<string, number> = {};
    const scores = { ...quiz.scores };
    for (const [userId, response] of Object.entries(quiz.currentResponses)) {
      if (response.choice !== question.correctIndex) continue;
      const fraction = Math.max(0, Math.min(1, (response.answeredAt - quiz.questionStartedAt) / duration));
      const points = fraction <= 1 / 3 ? 3 : fraction <= 2 / 3 ? 2 : 1;
      awarded[userId] = points;
      scores[userId] = (scores[userId] ?? 0) + points;
    }
    const updated = quizSchema.parse({ ...quiz, status: "results", scores });
    settings[guildId]!.quizzes!.entries[String(quizId)] = updated;
    await saveSettings();
    result = { quiz: updated, awarded };
  });
  await writeQueue;
  return result;
}

export async function createJoust(
  guildId: string,
  input: Pick<Joust, "title" | "hostId" | "channelId">,
): Promise<Joust> {
  let created: Joust | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId] ?? {};
    const jousts = guildSettings.jousts ?? { nextJoustNumber: 1, entries: {} };
    const id = jousts.nextJoustNumber;
    created = joustSchema.parse({
      ...input,
      id,
      status: "draft",
      entrants: {},
      round: 0,
      matches: [],
      championIds: [],
      createdAt: Date.now(),
    });
    jousts.nextJoustNumber += 1;
    jousts.entries[String(id)] = created;
    guildSettings.jousts = jousts;
    settings[guildId] = guildSettings;
    await saveSettings();
  });
  await writeQueue;
  if (!created) throw new Error("JOUST_CREATE_FAILED");
  return created;
}

export async function getJoust(guildId: string, joustId: number): Promise<Joust | undefined> {
  const settings = await getGuildSettings(guildId);
  return settings.jousts?.entries[String(joustId)];
}

export async function getGuildJousts(guildId: string): Promise<Joust[]> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.jousts?.entries ?? {}).sort((a, b) => b.id - a.id);
}

export async function updateJoust(
  guildId: string,
  joustId: number,
  changes: Partial<Joust>,
): Promise<Joust | undefined> {
  let updated: Joust | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const joust = settings[guildId]?.jousts?.entries[String(joustId)];
    if (!joust) return;
    updated = joustSchema.parse({ ...joust, ...changes, id: joust.id });
    settings[guildId]!.jousts!.entries[String(joustId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function enterJoust(
  guildId: string,
  joustId: number,
  entry: Omit<JoustEntrant, "active" | "wins" | "houseRoleId">,
): Promise<Joust | undefined> {
  if (!validJoustBuild(entry.health, entry.damage, entry.resistance)) throw new Error("INVALID_JOUST_BUILD");
  let updated: Joust | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const joust = settings[guildId]?.jousts?.entries[String(joustId)];
    if (!joust || joust.status !== "lobby") return;
    const entrant = joustEntrantSchema.parse({
      ...entry,
      houseRoleId: entry.chosenHouseRoleId,
      active: true,
      wins: 0,
    });
    updated = joustSchema.parse({ ...joust, entrants: { ...joust.entrants, [entry.userId]: entrant } });
    settings[guildId]!.jousts!.entries[String(joustId)] = updated;
    await saveSettings();
  });
  await writeQueue;
  return updated;
}

export async function withdrawFromJoust(guildId: string, joustId: number, userId: string): Promise<boolean> {
  let removed = false;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const joust = settings[guildId]?.jousts?.entries[String(joustId)];
    if (!joust || joust.status !== "lobby" || !joust.entrants[userId]) return;
    delete joust.entrants[userId];
    removed = true;
    await saveSettings();
  });
  await writeQueue;
  return removed;
}

export async function startJoust(
  guildId: string,
  joustId: number,
  availableHouseRoleIds: string[],
  random: () => number = Math.random,
): Promise<{ joust: Joust; moved: Array<{ userId: string; from: string; to: string }> }> {
  let result: { joust: Joust; moved: Array<{ userId: string; from: string; to: string }> } | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const joust = settings[guildId]?.jousts?.entries[String(joustId)];
    if (!joust || joust.status !== "lobby") return;
    const available = [...new Set(availableHouseRoleIds)];
    const validEntrants = Object.values(joust.entrants).filter((entrant) => available.includes(entrant.chosenHouseRoleId));
    if (validEntrants.length < 2) throw new Error("NOT_ENOUGH_JOUSTERS");
    if (available.length < 2) throw new Error("NOT_ENOUGH_HOUSES");
    const balanced = balanceJoustHouses(validEntrants, available, random);
    const entrants = Object.fromEntries(balanced.entrants.map((entrant) => [entrant.userId, { ...entrant, active: true, wins: 0 }]));
    const updated = joustSchema.parse({ ...joust, status: "active", entrants, round: 0, matches: [], championIds: [] });
    settings[guildId]!.jousts!.entries[String(joustId)] = updated;
    await saveSettings();
    result = { joust: updated, moved: balanced.moved };
  });
  await writeQueue;
  if (!result) throw new Error("JOUST_NOT_READY");
  return result;
}

export async function resolveJoustRound(
  guildId: string,
  joustId: number,
  staffId: string,
  random: () => number = Math.random,
): Promise<{ joust: Joust; matches: JoustMatch[]; byes: string[]; pointsAwarded: number }> {
  let result: { joust: Joust; matches: JoustMatch[]; byes: string[]; pointsAwarded: number } | undefined;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const settings = await loadSettings();
    const guildSettings = settings[guildId];
    const joust = guildSettings?.jousts?.entries[String(joustId)];
    if (!guildSettings || !joust || joust.status !== "active") return;
    const active = Object.values(joust.entrants).filter((entrant) => entrant.active);
    const activeHouses = new Set(active.map((entrant) => entrant.houseRoleId));
    if (active.length <= 1 || activeHouses.size <= 1) {
      const finished = joustSchema.parse({ ...joust, status: "finished", championIds: active.map((entrant) => entrant.userId) });
      guildSettings.jousts!.entries[String(joustId)] = finished;
      await saveSettings();
      result = { joust: finished, matches: [], byes: [], pointsAwarded: 0 };
      return;
    }

    const draw = drawCrossHousePairings(active, random);
    if (!draw.pairs.length) throw new Error("NO_VALID_JOUST_PAIRING");
    const round = joust.round + 1;
    const entrants = structuredClone(joust.entrants);
    const matches: JoustMatch[] = [];
    const state = guildSettings.housePoints ?? { scores: {}, transactions: [] };
    const transactions = [...state.transactions];
    const scores = { ...state.scores };

    for (const pair of draw.pairs) {
      const left = entrants[pair.leftId]!;
      const right = entrants[pair.rightId]!;
      const tilt = simulateTilt(left, right, random);
      entrants[tilt.loserId]!.active = false;
      entrants[tilt.winnerId]!.wins += 1;
      const winner = entrants[tilt.winnerId]!;
      matches.push(joustMatchSchema.parse({ round, leftId: pair.leftId, rightId: pair.rightId, winnerId: tilt.winnerId, loserId: tilt.loserId, houseRoleId: winner.houseRoleId, passes: tilt.passes, decidedBy: tilt.decidedBy }));
      scores[winner.houseRoleId] = (scores[winner.houseRoleId] ?? 0) + 2;
      transactions.push(housePointTransactionSchema.parse({
        id: randomBytes(4).toString("hex"),
        houseRoleId: winner.houseRoleId,
        delta: 2,
        reason: `Joust #${joust.id}: ${joust.title} · round ${round} tilt won`,
        memberId: winner.userId,
        staffId,
        createdAt: Date.now(),
      }));
    }

    guildSettings.housePoints = housePointsSchema.parse({ scores, transactions: transactions.slice(-5000) });
    const survivors = Object.values(entrants).filter((entrant) => entrant.active);
    const survivorHouses = new Set(survivors.map((entrant) => entrant.houseRoleId));
    const finished = survivors.length <= 1 || survivorHouses.size <= 1;
    const updated = joustSchema.parse({
      ...joust,
      status: finished ? "finished" : "active",
      entrants,
      round,
      matches: [...joust.matches, ...matches],
      championIds: finished ? survivors.map((entrant) => entrant.userId) : [],
    });
    guildSettings.jousts!.entries[String(joustId)] = updated;
    await saveSettings();
    result = { joust: updated, matches, byes: draw.byes, pointsAwarded: matches.length * 2 };
  });
  await writeQueue;
  if (!result) throw new Error("JOUST_NOT_ACTIVE");
  return result;
}
