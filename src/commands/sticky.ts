import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../types/command.js";
import { suppressPersistentDeletion } from "../reliability/suppression.js";
import { getGuildSettings, removeStickyMessage, saveStickyMessage } from "../services/guild-settings.js";

async function sendSticky(channel: GuildTextBasedChannel, content: string) {
  return channel.send({ content, allowedMentions: { parse: [] } });
}

export const stickyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Manage sticky messages that stay at the bottom of a channel.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) => sub
      .setName("set")
      .setDescription("Set or replace a sticky message in a channel.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("The channel that should keep this message at the bottom.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
      .addStringOption((option) => option
        .setName("message")
        .setDescription("The sticky text. Discord Markdown is supported.")
        .setMaxLength(1900)
        .setRequired(true)))
    .addSubcommand((sub) => sub
      .setName("remove")
      .setDescription("Remove a sticky message from a channel.")
      .addChannelOption((option) => option
        .setName("channel")
        .setDescription("The sticky channel to clear.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("List this server's sticky messages.")),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set") {
      const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
      const content = interaction.options.getString("message", true).trim();
      const settings = await getGuildSettings(interaction.guildId);
      const previous = settings.stickyMessages?.[channel.id];
      if (previous?.messageId) {
        suppressPersistentDeletion(previous.messageId);
        await channel.messages.fetch(previous.messageId).then((message) => message.delete()).catch(() => undefined);
      }
      const sent = await sendSticky(channel, content);
      await saveStickyMessage(interaction.guildId, channel.id, {
        content,
        messageId: sent.id,
        updatedBy: interaction.user.id,
        updatedAt: Date.now(),
      });
      await interaction.reply({ content: `Sticky message set in ${channel}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "remove") {
      const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
      const settings = await getGuildSettings(interaction.guildId);
      const sticky = settings.stickyMessages?.[channel.id];
      if (!sticky) {
        await interaction.reply({ content: `${channel} does not have a sticky message.`, flags: MessageFlags.Ephemeral });
        return;
      }
      if (sticky.messageId) {
        suppressPersistentDeletion(sticky.messageId);
        await channel.messages.fetch(sticky.messageId).then((message) => message.delete()).catch(() => undefined);
      }
      await removeStickyMessage(interaction.guildId, channel.id);
      await interaction.reply({ content: `Sticky message removed from ${channel}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    const entries = Object.entries(settings.stickyMessages ?? {});
    const embed = new EmbedBuilder().setColor(0xb8c2cc).setTitle("📌 Sticky Messages");
    if (!entries.length) {
      embed.setDescription("No sticky messages are configured.");
    } else {
      embed.setDescription(entries.map(([channelId, sticky]) => `<#${channelId}> — ${sticky.content.replace(/\s+/g, " ").slice(0, 90)}${sticky.content.length > 90 ? "…" : ""}`).join("\n").slice(0, 4000));
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
