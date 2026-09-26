import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from "discord.js";
import type { Command } from "../types/command.js";
import { achievementDefinitions, achievementMap } from "../achievements/definitions.js";
import { awardAchievement, getMemberAchievements, revokeAchievement } from "../services/guild-settings.js";

const choices = achievementDefinitions.map((achievement) => ({ name: `${achievement.emoji} ${achievement.name}`, value: achievement.id }));

export const achievementsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("View or manage Realm achievements.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("view").setDescription("View a member's achievements.")
      .addUserOption((option) => option.setName("member").setDescription("Defaults to you.")))
    .addSubcommand((subcommand) => subcommand.setName("grant").setDescription("Grant a special achievement.")
      .addUserOption((option) => option.setName("member").setDescription("The recipient.").setRequired(true))
      .addStringOption((option) => option.setName("achievement").setDescription("The achievement to grant.").setRequired(true).addChoices(...choices)))
    .addSubcommand((subcommand) => subcommand.setName("revoke").setDescription("Remove an achievement granted in error.")
      .addUserOption((option) => option.setName("member").setDescription("The member.").setRequired(true))
      .addStringOption((option) => option.setName("achievement").setDescription("The achievement to remove.").setRequired(true).addChoices(...choices))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser("member") ?? interaction.user;
    if (subcommand === "view") {
      const awards = await getMemberAchievements(interaction.guildId, user.id);
      const description = awards.length
        ? awards.map((award) => {
          const definition = achievementMap.get(award.achievementId);
          return definition ? `${definition.emoji} **${definition.name}** · <t:${Math.floor(award.awardedAt / 1000)}:D>\n${definition.description}` : `🏅 **${award.achievementId}**`;
        }).join("\n\n")
        : "No achievements have been earned yet.";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(member?.displayColor || 0xd4af37)
        .setTitle(`${member?.displayName ?? user.username} · Achievements`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(description.slice(0, 4096))
        .setFooter({ text: `${awards.length}/${achievementDefinitions.length} achievements earned` })] });
      return;
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need **Manage Server** to grant or revoke achievements.", flags: MessageFlags.Ephemeral });
      return;
    }
    const achievementId = interaction.options.getString("achievement", true);
    const definition = achievementMap.get(achievementId)!;
    if (subcommand === "grant") {
      const result = await awardAchievement(interaction.guildId, user.id, achievementId, interaction.user.id);
      await interaction.reply({ content: result.isNew ? `${definition.emoji} **${definition.name}** was granted to ${user}.` : `${user} already has **${definition.name}**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const removed = await revokeAchievement(interaction.guildId, user.id, achievementId);
    await interaction.reply({ content: removed ? `**${definition.name}** was removed from ${user}.` : `${user} does not have **${definition.name}**.`, flags: MessageFlags.Ephemeral });
  },
};
