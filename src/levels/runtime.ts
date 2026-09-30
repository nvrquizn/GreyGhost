import { Events, type Client, type GuildMember, type Message, type Role } from "discord.js";
import { addXp, getLevelGuild, LEVEL_THRESHOLDS, levelFromXp, type LevelThreshold } from "./store.js";
import { getGuildSettings } from "../services/guild-settings.js";

const recent = new Map<string, Array<{ at: number; fingerprint: string }>>();

function normalizeFingerprint(message: Message<true>): string {
  const text = message.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180);
  const media = [...message.attachments.values()].map((a) => a.name ?? a.contentType ?? "file").join("|");
  return `${text}|${media}`;
}

function baseXp(message: Message<true>): number {
  const customEmojiMatches = message.content.match(/<a?:\w+:\d+>/g) ?? [];
  const withoutCustom = message.content.replace(/<a?:\w+:\d+>/g, " ");
  const unicodeEmojiMatches = withoutCustom.match(/\p{Extended_Pictographic}/gu) ?? [];
  const withoutEmoji = withoutCustom.replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, "").trim();
  const textChars = withoutEmoji.length;
  const emojiCount = customEmojiMatches.length + unicodeEmojiMatches.length + message.stickers.size;
  const hasMedia = message.attachments.size > 0 || message.stickers.size > 0 || /https?:\/\/\S+/i.test(message.content);

  let xp = 0;
  if (textChars > 0) {
    const lengthBonus = Math.min(8, Math.floor(Math.sqrt(Math.min(textChars, 1600)) / 4));
    xp = 8 + lengthBonus;
    if (emojiCount > 0) xp += 1;
    if (hasMedia) xp += 2;
  } else if (emojiCount > 0) {
    xp = Math.min(5, 3 + Math.floor(emojiCount / 3));
  } else if (hasMedia) {
    xp = 4;
  }
  return Math.min(18, xp);
}

function spamMultiplier(message: Message<true>): number {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const history = (recent.get(key) ?? []).filter((entry) => now - entry.at < 60_000);
  const fingerprint = normalizeFingerprint(message);
  const last = history.at(-1);
  const inThirty = history.filter((entry) => now - entry.at < 30_000).length;
  let multiplier = 1;

  if (last && now - last.at < 5_000) multiplier *= 0.2;
  else if (last && now - last.at < 12_000) multiplier *= 0.5;
  else if (last && now - last.at < 30_000) multiplier *= 0.75;

  if (inThirty >= 5) multiplier *= 0.25;
  else if (inThirty >= 3) multiplier *= 0.5;

  if (fingerprint && history.some((entry) => entry.fingerprint === fingerprint)) multiplier *= 0.2;

  history.push({ at: now, fingerprint });
  recent.set(key, history.slice(-12));
  return Math.max(0.05, multiplier);
}

async function resolveThresholdRole(member: GuildMember, threshold: LevelThreshold): Promise<Role | undefined> {
  const guildConfig = await getLevelGuild(member.guild.id);
  const configured = guildConfig.roleIds[String(threshold)];
  if (configured) return member.guild.roles.cache.get(configured);
  return member.guild.roles.cache.find((role) => role.name === `Level ${threshold}+`);
}


export async function announceLevelUp(member: GuildMember, level: number): Promise<void> {
  const settings = await getGuildSettings(member.guild.id);
  if (!settings.levelAnnouncementChannelId) return;
  const channel = await member.guild.channels.fetch(settings.levelAnnouncementChannelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  await channel.send({
    content: `🎉 ${member} reached **Level ${level}**!`,
    allowedMentions: { users: [member.id] },
  }).catch(() => undefined);
}
export async function syncLevelRoles(member: GuildMember, level: number): Promise<void> {
  for (const threshold of LEVEL_THRESHOLDS) {
    const role = await resolveThresholdRole(member, threshold);
    if (!role) continue;
    const shouldHave = level >= threshold;
    const has = member.roles.cache.has(role.id);
    try {
      if (shouldHave && !has) await member.roles.add(role, `Grey Ghost level ${level}`);
      if (!shouldHave && has) await member.roles.remove(role, `Grey Ghost level ${level}`);
    } catch (error) {
      console.error(`Could not synchronize level role ${role.name} for ${member.user.tag}:`, error);
    }
  }
}

async function processMessage(message: Message<true>): Promise<void> {
  if (message.author.bot || message.webhookId || !message.guildId) return;
  const member = message.member;
  if (!member) return;
  const config = await getLevelGuild(message.guildId);
  if (config.excludedRoleIds.some((roleId) => member.roles.cache.has(roleId))) return;

  const base = baseXp(message);
  if (base <= 0) return;
  const awarded = Math.max(1, Math.floor(base * spamMultiplier(message)));
  const result = await addXp(message.guildId, message.author.id, awarded);
  const beforeLevel = levelFromXp(result.before.xp);
  const afterLevel = levelFromXp(result.after.xp);
  if (afterLevel !== beforeLevel) {
    await syncLevelRoles(member, afterLevel);
    if (afterLevel > beforeLevel) await announceLevelUp(member, afterLevel);
  }
}

export function registerLevelRuntime(client: Client): void {
  client.on(Events.GuildMemberAdd, (member) => {
    void (async () => {
      const guild = await getLevelGuild(member.guild.id);
      const record = guild.members[member.id];
      if (record) await syncLevelRoles(member, levelFromXp(record.xp));
    })().catch((error) => console.error("Could not restore level roles on join:", error));
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild()) return;
    void processMessage(message).catch((error) => console.error("Could not award message XP:", error));
  });
}
