import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const tradeOfferSchema = z.object({
  coins: z.number().int().min(0).default(0),
  itemIds: z.array(z.string()).max(50).default([]),
});

export const tradeSchema = z.object({
  id: z.number().int().positive(),
  initiatorId: z.string(),
  partnerId: z.string(),
  status: z.enum(["pending", "completed", "cancelled"]),
  offers: z.record(z.string(), tradeOfferSchema),
  confirmedUserIds: z.array(z.string()).max(2).default([]),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  completedAt: z.number().int().positive().optional(),
});

export const tradeGuildBackupSchema = z.object({
  nextTradeNumber: z.number().int().positive().default(1),
  trades: z.record(z.string(), tradeSchema).default({}),
});

const tradeFileSchema = z.record(z.string(), tradeGuildBackupSchema);
export type Trade = z.infer<typeof tradeSchema>;
export type TradeGuild = z.infer<typeof tradeGuildBackupSchema>;

const tradePath = resolve(process.cwd(), "data", "trades.json");
let cache: Record<string, TradeGuild> | undefined;
let writeQueue = Promise.resolve();

async function load(): Promise<Record<string, TradeGuild>> {
  if (cache) return cache;
  try { cache = tradeFileSchema.parse(JSON.parse(await readFile(tradePath, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const temp = `${tradePath}.tmp`;
  await mkdir(dirname(tradePath), { recursive: true });
  await writeFile(temp, `${JSON.stringify(await load(), null, 2)}\n`, "utf8");
  await rename(temp, tradePath);
}

async function mutate<T>(fn: (data: Record<string, TradeGuild>) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeQueue = writeQueue.catch(() => undefined).then(async () => { result = await fn(await load()); await persist(); });
  await writeQueue;
  return result;
}

function guildOf(data: Record<string, TradeGuild>, guildId: string): TradeGuild {
  return (data[guildId] ??= { nextTradeNumber: 1, trades: {} });
}

function participants(trade: Trade): string[] { return [trade.initiatorId, trade.partnerId]; }

export async function getTrade(guildId: string, tradeId: number): Promise<Trade | undefined> {
  return (await load())[guildId]?.trades[String(tradeId)];
}

export async function getActiveTradeForUser(guildId: string, userId: string): Promise<Trade | undefined> {
  return Object.values((await load())[guildId]?.trades ?? {}).find((trade) => trade.status === "pending" && participants(trade).includes(userId));
}

export async function createTrade(guildId: string, initiatorId: string, partnerId: string): Promise<Trade> {
  if (initiatorId === partnerId) throw new Error("CANNOT_TRADE_SELF");
  if (await getActiveTradeForUser(guildId, initiatorId)) throw new Error("ACTIVE_TRADE_EXISTS");
  if (await getActiveTradeForUser(guildId, partnerId)) throw new Error("PARTNER_BUSY");
  return mutate((data) => {
    const guild = guildOf(data, guildId);
    const id = guild.nextTradeNumber++;
    const now = Date.now();
    const trade = tradeSchema.parse({
      id, initiatorId, partnerId, status: "pending",
      offers: { [initiatorId]: { coins: 0, itemIds: [] }, [partnerId]: { coins: 0, itemIds: [] } },
      confirmedUserIds: [], createdAt: now, updatedAt: now,
    });
    guild.trades[String(id)] = trade;
    return trade;
  });
}

export async function updateTradeOffer(guildId: string, tradeId: number, userId: string, updater: (offer: { coins: number; itemIds: string[] }) => void): Promise<Trade> {
  return mutate((data) => {
    const trade = guildOf(data, guildId).trades[String(tradeId)];
    if (!trade || trade.status !== "pending") throw new Error("TRADE_NOT_ACTIVE");
    if (!participants(trade).includes(userId)) throw new Error("NOT_TRADE_PARTICIPANT");
    const offer = trade.offers[userId] ?? { coins: 0, itemIds: [] };
    updater(offer);
    trade.offers[userId] = tradeOfferSchema.parse(offer);
    trade.confirmedUserIds = [];
    trade.updatedAt = Date.now();
    return tradeSchema.parse(trade);
  });
}

export async function confirmTrade(guildId: string, tradeId: number, userId: string): Promise<Trade> {
  return mutate((data) => {
    const trade = guildOf(data, guildId).trades[String(tradeId)];
    if (!trade || trade.status !== "pending") throw new Error("TRADE_NOT_ACTIVE");
    if (!participants(trade).includes(userId)) throw new Error("NOT_TRADE_PARTICIPANT");
    if (!trade.confirmedUserIds.includes(userId)) trade.confirmedUserIds.push(userId);
    trade.updatedAt = Date.now();
    return tradeSchema.parse(trade);
  });
}

export async function completeTradeRecord(guildId: string, tradeId: number): Promise<Trade> {
  return mutate((data) => {
    const trade = guildOf(data, guildId).trades[String(tradeId)];
    if (!trade || trade.status !== "pending") throw new Error("TRADE_NOT_ACTIVE");
    if (trade.confirmedUserIds.length < 2) throw new Error("TRADE_NOT_CONFIRMED");
    trade.status = "completed";
    trade.completedAt = Date.now();
    trade.updatedAt = Date.now();
    return tradeSchema.parse(trade);
  });
}

export async function cancelTrade(guildId: string, tradeId: number, userId: string): Promise<Trade> {
  return mutate((data) => {
    const trade = guildOf(data, guildId).trades[String(tradeId)];
    if (!trade || trade.status !== "pending") throw new Error("TRADE_NOT_ACTIVE");
    if (!participants(trade).includes(userId)) throw new Error("NOT_TRADE_PARTICIPANT");
    trade.status = "cancelled";
    trade.confirmedUserIds = [];
    trade.updatedAt = Date.now();
    return tradeSchema.parse(trade);
  });
}

export async function exportGuildTrades(guildId: string): Promise<TradeGuild> {
  return tradeGuildBackupSchema.parse((await load())[guildId] ?? { nextTradeNumber: 1, trades: {} });
}

export async function replaceGuildTrades(guildId: string, value: unknown): Promise<void> {
  const parsed = tradeGuildBackupSchema.parse(value);
  await mutate((data) => { data[guildId] = parsed; });
}
