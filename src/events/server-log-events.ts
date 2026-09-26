import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Events,
  OverwriteType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildChannel,
  type Message,
  type PartialMessage,
  type PermissionOverwrites,
  type ThreadChannel,
  type User,
} from "discord.js";
import { getGuildSettings } from "../services/guild-settings.js";

const GHOST_PING_WINDOW_MS = 30_000;

function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function readableName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

function channelTypeName(type: ChannelType): string {
  switch (type) {
    case ChannelType.GuildText: return "Text channel";
    case ChannelType.GuildAnnouncement: return "Announcement channel";
    case ChannelType.GuildVoice: return "Voice channel";
    case ChannelType.GuildStageVoice: return "Stage channel";
    case ChannelType.GuildForum: return "Forum channel";
    case ChannelType.GuildMedia: return "Media channel";
    case ChannelType.GuildCategory: return "Category";
    case ChannelType.PublicThread: return "Public thread";
    case ChannelType.PrivateThread: return "Private thread";
    case ChannelType.AnnouncementThread: return "Announcement thread";
    default: return `Channel type ${type}`;
  }
}

async function serverLogChannel(guild: Guild) {
  const settings = await getGuildSettings(guild.id);
  const channelId = settings.serverLogChannelId ?? settings.reactionLogChannelId;
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const channel = await serverLogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
}

async function recentAuditActor(
  guild: Guild,
  targetId: string,
  actions: AuditLogEvent[],
): Promise<User | null> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  const audit = await guild.fetchAuditLogs({ limit: 12 }).catch(() => null);
  if (!audit) return null;
  const entry = audit.entries.find((candidate) =>
    candidate.targetId === targetId
    && actions.includes(candidate.action)
    && Date.now() - candidate.createdTimestamp <= 10_000,
  );
  const executor = entry?.executor;
  if (!executor) return null;
  return executor.partial ? await executor.fetch().catch(() => null) : executor;
}

function actorField(actor: User | null) {
  return {
    name: "Performed by",
    value: actor ? `${actor}\n\`${actor.id}\`` : "Unavailable (check Grey Ghost's View Audit Log permission)",
    inline: true,
  };
}

function messageContent(message: Message | PartialMessage): string {
  if (message.content?.trim()) return shorten(message.content.trim(), 1_000);
  return "*No text content; the message may have contained only an embed, sticker, or attachment.*";
}

function attachmentSummary(message: Message | PartialMessage): string | undefined {
  if (!message.attachments.size) return undefined;
  return shorten(
    message.attachments.map((attachment) => `[${attachment.name ?? "attachment"}](${attachment.url})`).join("\n"),
    1_000,
  );
}

async function notifyGhostPingTargets(message: Message | PartialMessage): Promise<{ members: string[]; delivered: number }> {
  if (!message.guild || !message.author || Date.now() - message.createdTimestamp > GHOST_PING_WINDOW_MS) {
    return { members: [], delivered: 0 };
  }

  const targets = [...message.mentions.users.values()].filter(
    (user) => !user.bot && user.id !== message.author?.id,
  );
  if (!targets.length) return { members: [], delivered: 0 };

  const notice = shorten(message.content?.trim() || "No text content was available.", 700);
  const deliveries = await Promise.allSettled(
    targets.map((target) => target.send({
      content: `You were ghost-pinged by **${message.author?.tag ?? "an unknown member"}** in **#${"name" in message.channel ? message.channel.name : "unknown-channel"}**. Their message was deleted within 30 seconds.\n\n> ${notice.replace(/\n/g, "\n> ")}`,
      allowedMentions: { parse: [] },
    })),
  );

  return {
    members: targets.map((target) => `${target} (\`${target.id}\`)`),
    delivered: deliveries.filter((result) => result.status === "fulfilled").length,
  };
}

async function logDeletedMessage(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;
  const ghostPing = await notifyGhostPingTargets(message);
  const embed = new EmbedBuilder()
    .setColor(ghostPing.members.length ? 0xd48a3a : 0x8f4b4b)
    .setTitle(ghostPing.members.length ? "Message deleted · Ghost ping detected" : "Message deleted")
    .setDescription(messageContent(message))
    .addFields(
      { name: "Author", value: message.author ? `${message.author}\n\`${message.author.id}\`` : "Unknown or uncached", inline: true },
      { name: "Channel", value: `${message.channel}\n\`${message.channel.id}\``, inline: true },
      { name: "Message ID", value: `\`${message.id}\``, inline: true },
    )
    .setTimestamp();

  const attachments = attachmentSummary(message);
  if (attachments) embed.addFields({ name: "Attachments", value: attachments });
  if (ghostPing.members.length) {
    embed.addFields({
      name: `Ghost-pinged member${ghostPing.members.length === 1 ? "" : "s"}`,
      value: shorten(`${ghostPing.members.join("\n")}\nDM delivered to ${ghostPing.delivered}/${ghostPing.members.length}.`, 1_000),
    });
  }
  await sendLog(message.guild, embed);
}

async function logEditedMessage(oldMessage: Message | PartialMessage, newMessage: Message): Promise<void> {
  if (!newMessage.guild || newMessage.author.bot) return;
  const before = oldMessage.content?.trim() || "*Original content unavailable or empty.*";
  const after = newMessage.content?.trim() || "*New content is empty.*";
  if (before === after && oldMessage.attachments.size === newMessage.attachments.size) return;

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("Message edited")
    .addFields(
      { name: "Author", value: `${newMessage.author}\n\`${newMessage.author.id}\``, inline: true },
      { name: "Channel", value: `${newMessage.channel}\n\`${newMessage.channel.id}\``, inline: true },
      { name: "Message", value: `[Jump to message](${newMessage.url})\n\`${newMessage.id}\``, inline: true },
      { name: "Before", value: shorten(before, 1_000) },
      { name: "After", value: shorten(after, 1_000) },
    )
    .setTimestamp();
  await sendLog(newMessage.guild, embed);
}

function baseChannelFields(channel: GuildChannel) {
  return [
    { name: "Type", value: channelTypeName(channel.type), inline: true },
    { name: "Channel ID", value: `\`${channel.id}\``, inline: true },
    { name: "Category", value: channel.parentId ? `<#${channel.parentId}>` : "None", inline: true },
  ];
}

async function logChannelLifecycle(channel: GuildChannel, action: "created" | "deleted"): Promise<void> {
  const actor = await recentAuditActor(channel.guild, channel.id, [
    action === "created" ? AuditLogEvent.ChannelCreate : AuditLogEvent.ChannelDelete,
  ]);
  const embed = new EmbedBuilder()
    .setColor(action === "created" ? 0x82a67d : 0x8f4b4b)
    .setTitle(`${channelTypeName(channel.type)} ${action}`)
    .setDescription(`**#${channel.name}** was ${action}.`)
    .addFields(...baseChannelFields(channel), actorField(actor))
    .setTimestamp();
  await sendLog(channel.guild, embed);
}

function changedSettings(oldChannel: GuildChannel, newChannel: GuildChannel): string[] {
  const changes: string[] = [];
  if (oldChannel.name !== newChannel.name) changes.push(`**Name:** \`${oldChannel.name}\` → \`${newChannel.name}\``);
  if (oldChannel.parentId !== newChannel.parentId) changes.push(`**Category:** ${oldChannel.parentId ? `<#${oldChannel.parentId}>` : "None"} → ${newChannel.parentId ? `<#${newChannel.parentId}>` : "None"}`);

  if ("topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic) {
    const oldTopic = typeof oldChannel.topic === "string" ? oldChannel.topic : "None";
    const newTopic = typeof newChannel.topic === "string" ? newChannel.topic : "None";
    changes.push(`**Topic:** ${shorten(oldTopic || "None", 350)} → ${shorten(newTopic || "None", 350)}`);
  }
  if ("nsfw" in oldChannel && "nsfw" in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
    changes.push(`**Age-restricted:** ${oldChannel.nsfw ? "Yes" : "No"} → ${newChannel.nsfw ? "Yes" : "No"}`);
  }
  if ("rateLimitPerUser" in oldChannel && "rateLimitPerUser" in newChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser ?? 0}s → ${newChannel.rateLimitPerUser ?? 0}s`);
  }
  if ("bitrate" in oldChannel && "bitrate" in newChannel && oldChannel.bitrate !== newChannel.bitrate) {
    changes.push(`**Bitrate:** ${oldChannel.bitrate} → ${newChannel.bitrate}`);
  }
  if ("userLimit" in oldChannel && "userLimit" in newChannel && oldChannel.userLimit !== newChannel.userLimit) {
    changes.push(`**User limit:** ${oldChannel.userLimit || "Unlimited"} → ${newChannel.userLimit || "Unlimited"}`);
  }
  return changes;
}

type PermissionState = "Allowed" | "Denied" | "Reset";

function permissionState(overwrite: PermissionOverwrites | undefined, permission: bigint): PermissionState {
  if (overwrite?.allow.has(permission)) return "Allowed";
  if (overwrite?.deny.has(permission)) return "Denied";
  return "Reset";
}

function permissionTarget(overwrite: PermissionOverwrites, guild: Guild): string {
  if (overwrite.type === OverwriteType.Role) {
    return overwrite.id === guild.id ? "@everyone" : `<@&${overwrite.id}>`;
  }
  return `<@${overwrite.id}>`;
}

async function logPermissionChanges(oldChannel: GuildChannel, newChannel: GuildChannel, actor: User | null): Promise<void> {
  const overwriteIds = new Set([
    ...oldChannel.permissionOverwrites.cache.keys(),
    ...newChannel.permissionOverwrites.cache.keys(),
  ]);

  for (const overwriteId of overwriteIds) {
    const oldOverwrite = oldChannel.permissionOverwrites.cache.get(overwriteId);
    const newOverwrite = newChannel.permissionOverwrites.cache.get(overwriteId);
    const reference = newOverwrite ?? oldOverwrite;
    if (!reference) continue;

    const changes: string[] = [];
    for (const [permissionName, permission] of Object.entries(PermissionFlagsBits) as Array<[string, bigint]>) {
      const before = permissionState(oldOverwrite, permission);
      const after = permissionState(newOverwrite, permission);
      if (before !== after) changes.push(`**${readableName(permissionName)}:** ${before} → ${after}`);
    }
    if (!changes.length) continue;

    const target = permissionTarget(reference, newChannel.guild);
    const embed = new EmbedBuilder()
      .setColor(0x738adb)
      .setTitle(`${channelTypeName(newChannel.type)} permissions changed`)
      .setDescription(shorten(changes.join("\n"), 4_000))
      .addFields(
        { name: "Channel", value: `${newChannel}\n\`${newChannel.id}\``, inline: true },
        { name: "Affected role/member", value: `${target}\n\`${overwriteId}\``, inline: true },
        actorField(actor),
      )
      .setTimestamp();
    await sendLog(newChannel.guild, embed);
  }
}

async function logChannelUpdate(oldChannel: GuildChannel, newChannel: GuildChannel): Promise<void> {
  const actor = await recentAuditActor(newChannel.guild, newChannel.id, [
    AuditLogEvent.ChannelUpdate,
    AuditLogEvent.ChannelOverwriteCreate,
    AuditLogEvent.ChannelOverwriteUpdate,
    AuditLogEvent.ChannelOverwriteDelete,
  ]);
  const settings = changedSettings(oldChannel, newChannel);
  if (settings.length) {
    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`${channelTypeName(newChannel.type)} updated`)
      .setDescription(shorten(settings.join("\n"), 4_000))
      .addFields(...baseChannelFields(newChannel), actorField(actor))
      .setTimestamp();
    await sendLog(newChannel.guild, embed);
  }
  await logPermissionChanges(oldChannel, newChannel, actor);
}

function threadSettings(oldThread: ThreadChannel, newThread: ThreadChannel): string[] {
  const changes: string[] = [];
  if (oldThread.name !== newThread.name) changes.push(`**Name:** \`${oldThread.name}\` → \`${newThread.name}\``);
  if (oldThread.parentId !== newThread.parentId) changes.push(`**Parent:** <#${oldThread.parentId}> → <#${newThread.parentId}>`);
  if (oldThread.archived !== newThread.archived) changes.push(`**Archived:** ${oldThread.archived ? "Yes" : "No"} → ${newThread.archived ? "Yes" : "No"}`);
  if (oldThread.locked !== newThread.locked) changes.push(`**Locked:** ${oldThread.locked ? "Yes" : "No"} → ${newThread.locked ? "Yes" : "No"}`);
  if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) changes.push(`**Auto-archive:** ${oldThread.autoArchiveDuration ?? "Default"} min → ${newThread.autoArchiveDuration ?? "Default"} min`);
  if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) changes.push(`**Slowmode:** ${oldThread.rateLimitPerUser ?? 0}s → ${newThread.rateLimitPerUser ?? 0}s`);
  return changes;
}

async function logThreadLifecycle(thread: ThreadChannel, action: "created" | "deleted"): Promise<void> {
  const actor = await recentAuditActor(thread.guild, thread.id, [
    action === "created" ? AuditLogEvent.ThreadCreate : AuditLogEvent.ThreadDelete,
  ]);
  const embed = new EmbedBuilder()
    .setColor(action === "created" ? 0x82a67d : 0x8f4b4b)
    .setTitle(`${channelTypeName(thread.type)} ${action}`)
    .setDescription(`**${thread.name}** was ${action}.`)
    .addFields(
      { name: "Parent", value: thread.parentId ? `<#${thread.parentId}>` : "Unknown", inline: true },
      { name: "Thread ID", value: `\`${thread.id}\``, inline: true },
      actorField(actor),
    )
    .setTimestamp();
  await sendLog(thread.guild, embed);
}

export function registerServerLogEvents(client: Client): void {
  client.on(Events.MessageDelete, (message) => {
    void logDeletedMessage(message).catch((error) => console.error("Could not log a deleted message:", error));
  });

  client.on(Events.MessageBulkDelete, (messages) => {
    const recordAll = async () => {
      for (const message of messages.values()) await logDeletedMessage(message);
    };
    void recordAll().catch((error) => console.error("Could not log bulk-deleted messages:", error));
  });

  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    const resolve = async () => {
      const fetched = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
      if (fetched) await logEditedMessage(oldMessage, fetched);
    };
    void resolve().catch((error) => console.error("Could not log an edited message:", error));
  });

  client.on(Events.ChannelCreate, (channel) => {
    if (!channel.isThread()) void logChannelLifecycle(channel, "created").catch((error) => console.error("Could not log a created channel:", error));
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.isDMBased() && !channel.isThread()) void logChannelLifecycle(channel, "deleted").catch((error) => console.error("Could not log a deleted channel:", error));
  });

  client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    if (!oldChannel.isDMBased() && !newChannel.isDMBased() && !oldChannel.isThread() && !newChannel.isThread()) {
      void logChannelUpdate(oldChannel, newChannel).catch((error) => console.error("Could not log a channel update:", error));
    }
  });

  client.on(Events.ThreadCreate, (thread, newlyCreated) => {
    if (newlyCreated) void logThreadLifecycle(thread, "created").catch((error) => console.error("Could not log a created thread:", error));
  });

  client.on(Events.ThreadDelete, (thread) => {
    void logThreadLifecycle(thread, "deleted").catch((error) => console.error("Could not log a deleted thread:", error));
  });

  client.on(Events.ThreadUpdate, (oldThread, newThread) => {
    const record = async () => {
      const changes = threadSettings(oldThread, newThread);
      if (!changes.length) return;
      const actor = await recentAuditActor(newThread.guild, newThread.id, [AuditLogEvent.ThreadUpdate]);
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle(`${channelTypeName(newThread.type)} updated`)
        .setDescription(shorten(changes.join("\n"), 4_000))
        .addFields(
          { name: "Thread", value: `${newThread}\n\`${newThread.id}\``, inline: true },
          { name: "Parent", value: newThread.parentId ? `<#${newThread.parentId}>` : "Unknown", inline: true },
          actorField(actor),
        )
        .setTimestamp();
      await sendLog(newThread.guild, embed);
    };
    void record().catch((error) => console.error("Could not log a thread update:", error));
  });
}
