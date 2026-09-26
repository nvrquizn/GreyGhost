import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import {
  addChronicleEntry,
  addHouseChronicleEntry,
  awardAchievement,
  endHouseSeason,
  getCurrentHouseSeason,
  getHouseSeasons,
  startHouseSeason,
} from "../services/guild-settings.js";
import { getHouseStandings, renderHouseStandings } from "../housepoints/standings.js";
import { publishChronicleEntry } from "../chronicles/runtime.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";

export const seasonCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("season")
    .setDescription("Manage and review House Point seasons.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("View the active House season."))
    .addSubcommand((subcommand) => subcommand.setName("history").setDescription("View completed House seasons."))
    .addSubcommand((subcommand) => subcommand.setName("start").setDescription("Start a new season and reset active House scores.")
      .addStringOption((option) => option.setName("name").setDescription("The season name.").setMaxLength(100).setRequired(true))
      .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm that current House scores will reset.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("end").setDescription("End the active season and archive its winner.")
      .addBooleanOption((option) => option.setName("confirm").setDescription("Confirm that the season should end.").setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "status") {
      const season = await getCurrentHouseSeason(interaction.guildId);
      if (!season) {
        await interaction.reply({ content: "There is no active House season. Current House Points remain available through `/housepoints standings`." });
        return;
      }
      const embed = await renderHouseStandings(interaction.guild);
      embed.setTitle(`${season.name} · House Season #${season.id}`).setDescription(
        `Began <t:${Math.floor(season.startedAt / 1000)}:R>\n\n${embed.data.description ?? ""}`,
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }
    if (subcommand === "history") {
      const seasons = (await getHouseSeasons(interaction.guildId)).filter((season) => season.status === "finished").slice(0, 10);
      const description = seasons.length ? seasons.map((season) => {
        const winners = season.winnerRoleIds.length ? season.winnerRoleIds.map((id) => `<@&${id}>`).join(", ") : "No winner recorded";
        const highest = Math.max(0, ...Object.values(season.scores));
        return `**#${season.id} · ${season.name}**\n${winners} · **${highest}** points · <t:${Math.floor((season.endedAt ?? season.startedAt) / 1000)}:D>`;
      }).join("\n\n") : "No House seasons have been completed yet.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle("House Season History").setDescription(description)] });
      return;
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need **Manage Server** to start or end House seasons.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.options.getBoolean("confirm", true)) {
      await interaction.reply({ content: "No changes were made because confirmation was not enabled.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === "start") {
      try {
        const season = await startHouseSeason(interaction.guildId, interaction.options.getString("name", true));
        await interaction.reply({ content: `House season **#${season.id} · ${season.name}** has begun. Active House scores were reset to zero.` });
        void refreshStatsDashboard(interaction.guild).catch(() => undefined);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message === "ACTIVE_SEASON_EXISTS" ? "A House season is already active. End it before starting another." : "The season could not be started.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    let season;
    try {
      season = await endHouseSeason(interaction.guildId);
    } catch {
      await interaction.reply({ content: "There is no active House season to end.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    await interaction.guild.members.fetch();
    const standings = await getHouseStandings(interaction.guild);
    const winningNames = season.winnerRoleIds.map((roleId) => interaction.guild.roles.cache.get(roleId)?.name ?? roleId);
    const highest = Math.max(0, ...Object.values(season.scores));
    const entry = await addChronicleEntry(interaction.guildId, {
      type: "house_season",
      title: `${season.name} · Season Concluded`,
      description: winningNames.length
        ? `${winningNames.map((name) => `**${name}**`).join(" and ")} won the House season with **${highest}** points.`
        : "The season concluded without a House earning points.",
      occurredAt: season.endedAt ?? Date.now(),
      relatedUserIds: [], relatedRoleIds: season.winnerRoleIds,
      createdBy: interaction.user.id,
      sourceKey: `house-season:${season.id}`,
    });
    for (const roleId of season.winnerRoleIds) {
      const role = interaction.guild.roles.cache.get(roleId);
      for (const member of role?.members.values() ?? []) await awardAchievement(interaction.guildId, member.id, "season-victor");
      await addHouseChronicleEntry(interaction.guildId, {
        houseRoleId: roleId, type: "season_victory", title: `${season.name} · House Season Victory`,
        description: `<@&${roleId}> won House Season #${season.id} with **${highest}** points.`,
        occurredAt: season.endedAt ?? Date.now(), relatedUserIds: [...(role?.members.keys() ?? [])], createdBy: interaction.user.id, sourceKey: `house-season:${season.id}:house:${roleId}`,
      });
    }
    await publishChronicleEntry(interaction.guild, entry);
    const ranking = standings.length ? standings.map((standing, index) => `**${index + 1}.** <@&${standing.roleId}> — **${standing.points}**`).join("\n") : "No configured Houses.";
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`${season.name} · Final Standings`)
      .setDescription(ranking)
      .setFooter({ text: `Season #${season.id} archived in the Chronicles` })] });
    void refreshStatsDashboard(interaction.guild).catch(() => undefined);
  },
};
