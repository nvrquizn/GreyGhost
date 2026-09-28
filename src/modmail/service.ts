import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type TextChannel,
  type User,
} from "discord.js";
import { configuredModeratorRoleId, configuredTrialModeratorRoleId, hasRequiredModeratorRole, hasRequiredTrialModeratorRole } from "../moderation/access.js";
import {
  createModmailTicket,
  getGuildSettings,
  reserveModmailTicketNumber,
  updateModmailTicket,
  type ModmailTicket,
} from "../services/guild-settings.js";

export const MODMAIL_CATEGORIES = [
  ["report", "Report a Member", "Report rule-breaking or concerning conduct."],
  ["appeal", "Moderation Appeal", "Appeal a warning, mute, kick, or ban."],
  ["staff", "Staff Concern", "Raise a concern involving a staff member."],
  ["help", "Server Help", "Ask for private assistance with the server."],
  ["other", "Other", "Anything that does not fit the other categories."],
] as const;

export function ticketLabel(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export function safeChannelName(username: string): string {
  const cleaned = username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 45) || "member";
}

export async function isModmailStaffMember(member: GuildMember, configuredStaffRoleId?: string): Promise<boolean> {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (configuredStaffRoleId && member.roles.cache.has(configuredStaffRoleId)) return true;
  if (await hasRequiredModeratorRole(member.guild.id, member)) return true;
  return hasRequiredTrialModeratorRole(member.guild.id, member);
}

function ticketControls(ticket: ModmailTicket): ActionRowBuilder<ButtonBuilder> {
  if (ticket.status === "closed") {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`modmail:reopen:${ticket.id}`)
        .setLabel("Reopen Ticket")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`modmail:delete:${ticket.id}`)
        .setLabel("Delete Ticket · Moderator")
        .setStyle(ButtonStyle.Danger),
    );
  }

  const claimed = Boolean(ticket.claimedBy);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`modmail:claim:${ticket.id}`)
      .setLabel(claimed ? "Claimed" : "Claim")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId(`modmail:close:${ticket.id}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );
}

export async function refreshTicketHeader(guild: Guild, ticket: ModmailTicket): Promise<void> {
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.type !== ChannelType.GuildText) return;
  let message = ticket.headerMessageId
    ? await channel.messages.fetch(ticket.headerMessageId).catch(() => null)
    : null;
  if (!message) {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    message = recent?.find((candidate) =>
      candidate.author.id === guild.client.user.id &&
      candidate.embeds.some((embed) => embed.title?.startsWith(`Modmail Ticket ${ticketLabel(ticket.id)}`)),
    ) ?? null;
  }
  const source = message?.embeds[0];
  if (!message || !source) return;
  const status = ticket.status === "closed"
    ? `Closed${ticket.closedBy ? ` · by <@${ticket.closedBy}>` : ""}`
    : ticket.claimedBy
      ? `Open · Claimed by <@${ticket.claimedBy}>`
      : "Open · Unclaimed";
  const embed = EmbedBuilder.from(source).setFields(
    ...source.fields.map((field) => field.name === "Status" ? { ...field, value: status } : field),
  );
  await message.edit({ embeds: [embed], components: [ticketControls(ticket)] });
}

export async function findOpenTicket(guildId: string, userId: string): Promise<ModmailTicket | undefined> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.modmail?.tickets ?? {}).find(
    (ticket) => ticket.userId === userId && ticket.status === "open",
  );
}

export async function findTicketByChannel(guildId: string, channelId: string): Promise<ModmailTicket | undefined> {
  const settings = await getGuildSettings(guildId);
  return Object.values(settings.modmail?.tickets ?? {}).find((ticket) => ticket.channelId === channelId);
}

export async function configuredGuildsForUser(client: Client, userId: string): Promise<Guild[]> {
  const matches: Guild[] = [];
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id);
    if (!settings.modmail) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) matches.push(guild);
  }
  return matches;
}

export async function openTicket(
  guild: Guild,
  user: User,
  category: string,
  subject: string,
  details: string,
): Promise<ModmailTicket> {
  const settings = await getGuildSettings(guild.id);
  const config = settings.modmail;
  if (!config) throw new Error("MODMAIL_NOT_CONFIGURED");
  const existing = await findOpenTicket(guild.id, user.id);
  if (existing) throw new Error("OPEN_TICKET_EXISTS");

  const ticketNumber = await reserveModmailTicketNumber(guild.id);
  const name = `ticket-${String(ticketNumber).padStart(4, "0")}-${safeChannelName(user.username)}`.slice(0, 100);
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    topic: `Grey Ghost modmail ${ticketLabel(ticketNumber)} · ${user.tag} · ${user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...[...new Set([
        config.staffRoleId,
        await configuredModeratorRoleId(guild.id, guild),
        await configuredTrialModeratorRoleId(guild.id, guild),
      ].filter((id): id is string => Boolean(id)))].map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      })),
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  let ticket: ModmailTicket;
  try {
    ticket = await createModmailTicket(guild.id, {
      id: ticketNumber,
      userId: user.id,
      channelId: channel.id,
      category,
      subject,
    });
  } catch (error) {
    await channel.delete("Rolling back failed modmail ticket creation").catch(() => undefined);
    throw error;
  }

  const embed = new EmbedBuilder()
    .setColor(0x87ceeb)
    .setTitle(`Modmail Ticket ${ticketLabel(ticket.id)} · ${category}`)
    .setDescription(details)
    .addFields(
      { name: "Opened by", value: `${user} · ${user.tag}\n\`${user.id}\`` },
      { name: "Subject", value: subject },
      { name: "Status", value: "Open · Unclaimed" },
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp(ticket.openedAt);
  const header = await channel.send({ content: `<@&${config.staffRoleId}>`, embeds: [embed], components: [ticketControls(ticket)] });
  ticket = (await updateModmailTicket(guild.id, ticket.id, { headerMessageId: header.id })) ?? ticket;
  return ticket;
}

export async function forwardMemberMessage(message: Message, guild: Guild, ticket: ModmailTicket): Promise<void> {
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("TICKET_CHANNEL_MISSING");
  const attachments = [...message.attachments.values()];
  const embed = new EmbedBuilder()
    .setColor(0x87ceeb)
    .setAuthor({ name: `${message.author.tag} · Member`, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || (attachments.length ? "*Attachment sent.*" : "*No message content.*"))
    .setFooter({ text: `Ticket ${ticketLabel(ticket.id)} · User ID ${message.author.id}` })
    .setTimestamp();
  if (attachments[0]?.contentType?.startsWith("image/")) embed.setImage(attachments[0].url);
  await channel.send({
    embeds: [embed],
    content: attachments.length ? attachments.map((file) => `[${file.name ?? "Attachment"}](${file.url})`).join("\n") : undefined,
  });
}

export async function sendAnonymousReply(
  guild: Guild,
  ticket: ModmailTicket,
  staffId: string,
  content: string,
  attachment?: { url: string; name: string | null },
  logToTicketChannel = true,
): Promise<void> {
  const user = await guild.client.users.fetch(ticket.userId);
  const embed = new EmbedBuilder()
    .setColor(0xb8c2cc)
    .setAuthor({ name: `${guild.name} Staff · Grey Ghost` })
    .setTitle(`Reply to Ticket ${ticketLabel(ticket.id)}`)
    .setDescription(content)
    .setFooter({ text: "Reply to this DM to continue the conversation." })
    .setTimestamp();
  if (attachment?.url && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(attachment.url)) embed.setImage(attachment.url);
  await user.send({ embeds: [embed], content: attachment ? `[${attachment.name ?? "Attachment"}](${attachment.url})` : undefined });

  const channel = logToTicketChannel
    ? await guild.channels.fetch(ticket.channelId).catch(() => null)
    : null;
  if (channel?.isTextBased() && !channel.isDMBased()) {
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x6fa36f).setAuthor({ name: "Anonymous staff reply sent" }).setDescription(content).addFields({ name: "Sent by", value: `<@${staffId}> · visible to staff only` }).setTimestamp()],
      content: attachment ? `[${attachment.name ?? "Attachment"}](${attachment.url})` : undefined,
    });
  }
}

async function fetchTranscript(channel: TextChannel): Promise<string> {
  const collected: Message[] = [];
  let before: string | undefined;
  while (collected.length < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    collected.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return collected.reverse().map((message) => {
    const time = message.createdAt.toISOString();
    const embeds = message.embeds.map((embed) => [embed.author?.name, embed.title, embed.description, ...embed.fields.map((field) => `${field.name}: ${field.value}`)].filter(Boolean).join(" | ")).join(" | ");
    const files = [...message.attachments.values()].map((file) => file.url).join(" ");
    return `[${time}] ${message.author.tag}: ${message.content || embeds || "(empty)"}${files ? ` ${files}` : ""}`;
  }).join("\n");
}

export async function closeTicket(
  guild: Guild,
  ticket: ModmailTicket,
  closedBy: string,
  reason = "No reason provided.",
): Promise<ModmailTicket> {
  const updated = await updateModmailTicket(guild.id, ticket.id, {
    status: "closed",
    closedAt: Date.now(),
    closedBy,
    closeReason: reason,
  });
  if (!updated) throw new Error("TICKET_NOT_FOUND");
  await refreshTicketHeader(guild, updated);
  const settings = await getGuildSettings(guild.id);
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
  const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
  await user?.send({
    embeds: [new EmbedBuilder().setColor(0x8b1e3f).setTitle(`Ticket ${ticketLabel(ticket.id)} Closed`).setDescription(reason).setFooter({ text: "DM Grey Ghost again whenever you need to open a new ticket." }).setTimestamp()],
  }).catch(() => undefined);

  if (channel?.type === ChannelType.GuildText) {
    const transcript = await fetchTranscript(channel);
    const logChannel = settings.modmail ? await guild.channels.fetch(settings.modmail.logChannelId).catch(() => null) : null;
    if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
      const file = new AttachmentBuilder(Buffer.from(transcript || "No transcript content.", "utf8"), { name: `ticket-${String(ticket.id).padStart(4, "0")}.txt` });
      await logChannel.send({
        embeds: [new EmbedBuilder().setColor(0x8b1e3f).setTitle(`Closed Modmail ${ticketLabel(ticket.id)}`).addFields(
          { name: "Member", value: `<@${ticket.userId}> · \`${ticket.userId}\`` },
          { name: "Category", value: ticket.category, inline: true },
          { name: "Closed by", value: closedBy === ticket.userId ? "The member" : `<@${closedBy}>`, inline: true },
          { name: "Reason", value: reason },
        ).setTimestamp()],
        files: [file],
      });
    }
    await channel.setName(`closed-${String(ticket.id).padStart(4, "0")}-${safeChannelName(user?.username ?? "member")}`.slice(0, 100));
    await channel.send({ content: `🔒 Ticket ${ticketLabel(ticket.id)} was closed. **Reason:** ${reason}` });
  }
  return updated;
}
export async function reopenTicket(
  guild: Guild,
  ticket: ModmailTicket,
  reopenedBy: string,
): Promise<ModmailTicket> {
  if (ticket.status === "deleted") throw new Error("TICKET_DELETED");
  if (ticket.status === "open") return ticket;

  const reopened = await updateModmailTicket(guild.id, ticket.id, {
    status: "open",
    closedAt: undefined,
    closedBy: undefined,
    closeReason: undefined,
    deletedAt: undefined,
    deletedBy: undefined,
  });
  if (!reopened) throw new Error("TICKET_NOT_FOUND");

  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
  const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
  if (channel?.type === ChannelType.GuildText) {
    await channel.setName(`ticket-${String(ticket.id).padStart(4, "0")}-${safeChannelName(user?.username ?? "member")}`.slice(0, 100));
    await channel.send(`🔓 <@${reopenedBy}> reopened ticket ${ticketLabel(ticket.id)}.`);
  }
  await refreshTicketHeader(guild, reopened);
  await user?.send(`Your ticket **${ticketLabel(ticket.id)}** with **${guild.name}** has been reopened by staff.`).catch(() => undefined);
  return reopened;
}

export async function deleteClosedTicket(
  guild: Guild,
  ticket: ModmailTicket,
  deletedBy: string,
): Promise<void> {
  if (ticket.status !== "closed") throw new Error("TICKET_NOT_CLOSED");
  const settings = await getGuildSettings(guild.id);
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("TICKET_CHANNEL_MISSING");

  const updated = await updateModmailTicket(guild.id, ticket.id, {
    status: "deleted",
    deletedAt: Date.now(),
    deletedBy,
  });
  if (!updated) throw new Error("TICKET_NOT_FOUND");

  const logChannel = settings.modmail ? await guild.channels.fetch(settings.modmail.logChannelId).catch(() => null) : null;
  if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5c5c5c)
        .setTitle(`Deleted Modmail ${ticketLabel(ticket.id)}`)
        .addFields(
          { name: "Member", value: `<@${ticket.userId}> · \`${ticket.userId}\`` },
          { name: "Deleted by", value: `<@${deletedBy}>`, inline: true },
          { name: "Status", value: "Closed ticket channel permanently deleted", inline: true },
        )
        .setTimestamp()],
    }).catch(() => undefined);
  }

  await channel.delete(`Closed modmail ticket ${ticketLabel(ticket.id)} deleted by ${deletedBy}`);
}

