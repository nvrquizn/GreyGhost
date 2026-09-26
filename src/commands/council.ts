import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { createCouncilProposal, getGuildSettings, updateCouncilProposal } from "../services/guild-settings.js";
import { renderCouncilProposal } from "../governance/render.js";

export const councilCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("council")
    .setDescription("Submit a private proposal to the staff council.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("propose")
      .setDescription("Submit a proposal for a private council vote.")
      .addStringOption((option) => option.setName("title").setDescription("A short proposal title.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("proposal").setDescription("Describe what you are proposing.").setMaxLength(3000).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const settings = await getGuildSettings(interaction.guildId);
    const governance = settings.governance;
    if (!governance) {
      await interaction.reply({ content: "Council proposals are not configured. The server owner must run `/setup governance`.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.member.roles.cache.has(governance.councilRoleId) && interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: "Only members of the configured council role may submit council proposals.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = await interaction.guild.channels.fetch(governance.councilChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "The configured council channel is unavailable.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const proposal = await createCouncilProposal(interaction.guildId, {
      authorId: interaction.user.id,
      title: interaction.options.getString("title", true),
      body: interaction.options.getString("proposal", true),
      channelId: channel.id,
    });
    const rendered = renderCouncilProposal(proposal);
    const message = await channel.send({ embeds: [rendered.embed], components: rendered.rows });
    await updateCouncilProposal(interaction.guildId, proposal.id, { messageId: message.id });
    await interaction.editReply(`Council proposal **#${proposal.id}** was posted in ${channel}.`);
  },
};
