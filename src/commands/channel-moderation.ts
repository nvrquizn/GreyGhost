import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { beginCase, caseLabel, recordChannelModerationCase, requireModerationSetup } from "../moderation/service.js";

export const purgeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages in this channel.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) => option.setName("amount").setDescription("Messages to delete (1–100).").setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((option) => option.setName("member").setDescription("Only delete messages from this member."))
    .addStringOption((option) => option.setName("reason").setDescription("Why the messages are being removed.").setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!(await requireModerationSetup(interaction.guildId))) {
      await interaction.reply({ content: "Run `/setup moderation` before using moderation commands.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "This command can only be used in a standard text channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const amount = interaction.options.getInteger("amount", true);
    const member = interaction.options.getUser("member");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const fetched = await channel.messages.fetch({ limit: 100 });
    const selected = fetched.filter((message) => !message.pinned && (!member || message.author.id === member.id)).first(amount);
    const deleted = await channel.bulkDelete(selected, true);
    const reason = interaction.options.getString("reason", true);
    const id = await beginCase(interaction.guildId);
    await recordChannelModerationCase(interaction.guild, { id, action: "purge", targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, reason: `${reason} · ${deleted.size} message(s) removed${member ? ` from ${member.tag}` : ""}.` });
    await interaction.editReply(`Deleted **${deleted.size}** message(s). Case **${caseLabel(id)}**.`);
  },
};

export const slowmodeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set this channel's slowmode interval.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) => option.setName("seconds").setDescription("Seconds between messages; use 0 to disable.").setMinValue(0).setMaxValue(21600).setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Why slowmode is changing.").setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "This command can only be used in a standard text channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await requireModerationSetup(interaction.guildId))) {
      await interaction.reply({ content: "Run `/setup moderation` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const seconds = interaction.options.getInteger("seconds", true);
    const reason = interaction.options.getString("reason", true);
    const id = await beginCase(interaction.guildId);
    await channel.setRateLimitPerUser(seconds, `Case ${caseLabel(id)} · ${interaction.user.tag}: ${reason}`.slice(0, 512));
    await recordChannelModerationCase(interaction.guild, { id, action: "slowmode", targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, reason: `${reason} · ${seconds ? `${seconds} second(s)` : "Disabled"}.` });
    await interaction.reply({ content: `Slowmode ${seconds ? `set to **${seconds} second(s)**` : "disabled"}. Case **${caseLabel(id)}**.`, flags: MessageFlags.Ephemeral });
  },
};

function channelLockCommand(action: "lock" | "unlock"): Command {
  return {
    data: new SlashCommandBuilder()
      .setName(action)
      .setDescription(`${action === "lock" ? "Prevent" : "Allow"} @everyone from sending messages in this channel.`)
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addStringOption((option) => option.setName("reason").setDescription(`Why the channel is being ${action === "lock" ? "locked" : "unlocked"}.`).setMaxLength(400).setRequired(true)),
    async execute(interaction) {
      if (!interaction.inCachedGuild()) return;
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "This command can only be used in a standard text channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!(await requireModerationSetup(interaction.guildId))) {
        await interaction.reply({ content: "Run `/setup moderation` first.", flags: MessageFlags.Ephemeral });
        return;
      }
      const reason = interaction.options.getString("reason", true);
      const id = await beginCase(interaction.guildId);
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: action === "lock" ? false : null }, { reason: `Case ${caseLabel(id)} · ${interaction.user.tag}: ${reason}`.slice(0, 512) });
      await recordChannelModerationCase(interaction.guild, { id, action, targetId: channel.id, targetTag: `#${channel.name}`, moderatorId: interaction.user.id, reason });
      await interaction.reply({ content: `${channel} was ${action === "lock" ? "locked" : "unlocked"}. Case **${caseLabel(id)}**.`, flags: MessageFlags.Ephemeral });
    },
  };
}

export const lockCommand = channelLockCommand("lock");
export const unlockCommand = channelLockCommand("unlock");
