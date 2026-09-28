import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type User,
} from "discord.js";
import {
  getGuildSettings,
  reserveModerationCaseNumber,
  saveModerationCase,
  type ModerationAction,
  type ModerationCase,
} from "../services/guild-settings.js";

const ACTION_LABELS: Record<ModerationAction, string> = {
  warn: "Warning",
  strike: "Strike",
  timeout: "Timeout",
  untimeout: "Timeout Removed",
  kick: "Kick",
  ban: "Ban",
  softban: "Softban",
  unban: "Unban",
  purge: "Message Purge",
  slowmode: "Slowmode Changed",
  lock: "Channel Locked",
  unlock: "Channel Unlocked",
};

const ACTION_COLORS: Record<ModerationAction, number> = {
  warn: 0xd4af37,
  strike: 0xb75b39,
  timeout: 0xd9792b,
  untimeout: 0x6fa36f,
  kick: 0xb75b39,
  ban: 0x8b1e3f,
  softban: 0xb75b39,
  unban: 0x5b8f70,
  purge: 0x7188a0,
  slowmode: 0x7188a0,
  lock: 0x8b1e3f,
  unlock: 0x6fa36f,
};

export function caseLabel(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export function actionLabel(action: ModerationAction): string {
  return ACTION_LABELS[action];
}

export function parseDuration(input: string): number | undefined {
  const match = input.trim().toLowerCase().match(/^(\d+)\s*(m|h|d|w)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isSafeInteger(amount) || amount < 1) return undefined;
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 604_800_000;
  const duration = amount * multiplier;
  return duration <= 28 * 86_400_000 ? duration : undefined;
}

export function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes % 10_080 === 0) return `${minutes / 10_080} week(s)`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440} day(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} minute(s)`;
}

export function memberActionError(
  actor: GuildMember,
  target: GuildMember,
  action: "warn" | "moderate" | "kick" | "ban",
): string | undefined {
  if (actor.id === target.id) return "You cannot moderate yourself.";
  if (target.id === target.guild.ownerId) return "The server owner cannot be moderated.";
  if (actor.id !== target.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return "You cannot moderate a member whose highest role is equal to or above yours.";
  }
  if (action === "moderate" && !target.moderatable) return "Grey Ghost cannot timeout that member. Check the bot's role position and permissions.";
  if (action === "kick" && !target.kickable) return "Grey Ghost cannot kick that member. Check the bot's role position and permissions.";
  if (action === "ban" && !target.bannable) return "Grey Ghost cannot ban that member. Check the bot's role position and permissions.";
  return undefined;
}

export async function requireModerationSetup(guildId: string): Promise<string | undefined> {
  return (await getGuildSettings(guildId)).moderation?.logChannelId;
}

export async function sendModerationDM(
  guild: Guild,
  user: User,
  action: ModerationAction,
  caseId: number,
  reason: string,
  durationMs?: number,
): Promise<boolean> {
  const embed = new EmbedBuilder()
    .setColor(ACTION_COLORS[action])
    .setTitle(`${ACTION_LABELS[action]} · ${guild.name}`)
    .setDescription(`A moderation action has been recorded for your account.`)
    .addFields(
      { name: "Action", value: ACTION_LABELS[action], inline: true },
      { name: "Case", value: caseLabel(caseId), inline: true },
      { name: "Reason", value: reason },
    )
    .setFooter({ text: "Use the server's modmail system if you need clarification or wish to appeal." })
    .setTimestamp();
  if (durationMs) embed.addFields({ name: "Duration", value: formatDuration(durationMs), inline: true });
  return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

export async function recordModerationCase(
  guild: Guild,
  input: {
    id: number;
    action: ModerationAction;
    target: User;
    moderatorId: string;
    reason: string;
    rule?: string;
    evidenceUrl?: string;
    durationMs?: number;
    dmDelivered: boolean;
  },
): Promise<ModerationCase> {
  const moderationCase = await saveModerationCase(guild.id, {
    id: input.id,
    action: input.action,
    targetId: input.target.id,
    targetTag: input.target.tag,
    moderatorId: input.moderatorId,
    reason: input.reason,
    rule: input.rule,
    evidenceUrl: input.evidenceUrl,
    durationMs: input.durationMs,
    expiresAt: input.durationMs ? Date.now() + input.durationMs : undefined,
    dmDelivered: input.dmDelivered,
    createdAt: Date.now(),
    status: "active",
  });
  const settings = await getGuildSettings(guild.id);
  const channel = settings.moderation
    ? await guild.channels.fetch(settings.moderation.logChannelId).catch(() => null)
    : null;
  if (channel?.isTextBased() && !channel.isDMBased()) {
    const embed = new EmbedBuilder()
      .setColor(ACTION_COLORS[input.action])
      .setTitle(`Case ${caseLabel(input.id)} · ${ACTION_LABELS[input.action]}`)
      .addFields(
        { name: "Member", value: `${input.target} · ${input.target.tag}\n\`${input.target.id}\`` },
        { name: "Moderator", value: `<@${input.moderatorId}>`, inline: true },
        { name: "DM", value: input.dmDelivered ? "Delivered" : "Could not deliver", inline: true },
        { name: "Reason", value: input.reason },
      )
      .setFooter({ text: `Case ${caseLabel(input.id)}` })
      .setTimestamp(moderationCase.createdAt);
    if (input.rule) embed.addFields({ name: "Rule", value: input.rule, inline: true });
    if (input.durationMs) embed.addFields({ name: "Duration", value: formatDuration(input.durationMs), inline: true });
    if (input.evidenceUrl) embed.addFields({ name: "Evidence", value: `[Open attachment](${input.evidenceUrl})` });
    await channel.send({ embeds: [embed] });
  }
  return moderationCase;
}

export async function recordChannelModerationCase(
  guild: Guild,
  input: {
    id: number;
    action: Extract<ModerationAction, "purge" | "slowmode" | "lock" | "unlock">;
    targetId: string;
    targetTag: string;
    moderatorId: string;
    reason: string;
  },
): Promise<ModerationCase> {
  const moderationCase = await saveModerationCase(guild.id, {
    id: input.id,
    action: input.action,
    targetId: input.targetId,
    targetTag: input.targetTag,
    moderatorId: input.moderatorId,
    reason: input.reason,
    dmDelivered: false,
    createdAt: Date.now(),
    status: "active",
  });
  const settings = await getGuildSettings(guild.id);
  const channel = settings.moderation
    ? await guild.channels.fetch(settings.moderation.logChannelId).catch(() => null)
    : null;
  if (channel?.isTextBased() && !channel.isDMBased()) {
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(ACTION_COLORS[input.action])
      .setTitle(`Case ${caseLabel(input.id)} · ${ACTION_LABELS[input.action]}`)
      .addFields(
        { name: "Channel", value: `<#${input.targetId}> · ${input.targetTag}` },
        { name: "Moderator", value: `<@${input.moderatorId}>`, inline: true },
        { name: "Reason", value: input.reason },
      )
      .setFooter({ text: `Case ${caseLabel(input.id)}` })
      .setTimestamp(moderationCase.createdAt)] });
  }
  return moderationCase;
}

export async function beginCase(guildId: string): Promise<number> {
  return reserveModerationCaseNumber(guildId);
}

export function auditReason(caseId: number, moderatorTag: string, reason: string): string {
  return `Case ${caseLabel(caseId)} · ${moderatorTag}: ${reason}`.slice(0, 512);
}

export function hasPermission(member: GuildMember, permission: bigint): boolean {
  return member.permissions.has(permission) || member.permissions.has(PermissionFlagsBits.Administrator);
}
