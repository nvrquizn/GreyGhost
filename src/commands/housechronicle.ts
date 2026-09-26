import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Role } from "discord.js";
import type { Command } from "../types/command.js";
import { addHouseChronicleEntry, getGuildSettings, getHouseChronicleEntries, getHousePoints, getHouseQuests, getHouseSeasons } from "../services/guild-settings.js";
import { getRenownMap } from "../economy/store.js";

const typeLabel: Record<string, string> = {
  season_victory: "Season Victory", quest_completed: "Quest Completed", event_placement: "Event Placement", milestone: "Milestone", manual: "Recorded History",
};

async function isConfiguredHouse(guildId: string, roleId: string): Promise<boolean> {
  const settings = await getGuildSettings(guildId);
  return Boolean(settings.selfRolePanels?.houses?.roles.some((entry) => entry.roleId === roleId));
}

export const houseChronicleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("housechronicle")
    .setDescription("Read or add to a Great House's permanent history.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("view").setDescription("View a House chronicle.")
      .addRoleOption((option) => option.setName("house").setDescription("The Great House.").setRequired(true))
      .addIntegerOption((option) => option.setName("page").setDescription("Chronicle page.").setMinValue(1)))
    .addSubcommand((sub) => sub.setName("add").setDescription("Record a special House event.")
      .addRoleOption((option) => option.setName("house").setDescription("The Great House.").setRequired(true))
      .addStringOption((option) => option.setName("title").setDescription("Entry title.").setMaxLength(120).setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("What happened.").setMaxLength(2000).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const house = interaction.options.getRole("house", true) as Role;
    if (!(await isConfiguredHouse(interaction.guildId, house.id))) {
      await interaction.reply({ content: `${house} is not configured in the House Allegiance panel.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "add") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need **Manage Server** to add House Chronicle entries.", flags: MessageFlags.Ephemeral });
        return;
      }
      const entry = await addHouseChronicleEntry(interaction.guildId, {
        houseRoleId: house.id, type: "manual",
        title: interaction.options.getString("title", true), description: interaction.options.getString("description", true),
        occurredAt: Date.now(), relatedUserIds: [], createdBy: interaction.user.id,
      });
      await interaction.reply({ content: `House Chronicle entry **#${entry.id}** was recorded for ${house}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    const [entries, points, seasons, quests] = await Promise.all([
      getHouseChronicleEntries(interaction.guildId, house.id), getHousePoints(interaction.guildId), getHouseSeasons(interaction.guildId), getHouseQuests(interaction.guildId),
    ]);
    await interaction.guild.members.fetch().catch(() => undefined);
    const memberIds = [...house.members.keys()];
    const renown = await getRenownMap(interaction.guildId, memberIds);
    const notable = [...renown.entries()].sort((a, b) => b[1] - a[1]).filter(([, value]) => value > 0).slice(0, 3);
    const seasonWins = seasons.filter((season) => season.status === "finished" && season.winnerRoleIds.includes(house.id)).length;
    const questWins = quests.filter((quest) => quest.houseRoleId === house.id && quest.status === "completed").length;
    const placements = entries.filter((entry) => entry.type === "event_placement").length;
    const pages = Math.max(1, Math.ceil(entries.length / 5));
    const page = Math.min(interaction.options.getInteger("page") ?? 1, pages);
    const selected = entries.slice((page - 1) * 5, page * 5);
    const history = selected.length ? selected.map((entry) => `**${entry.title}** · <t:${Math.floor(entry.occurredAt / 1000)}:D>\n*${typeLabel[entry.type] ?? entry.type}* · #${entry.id}\n${entry.description.slice(0, 500)}`).join("\n\n") : "No House Chronicle entries have been recorded yet.";
    const notableText = notable.length ? notable.map(([userId, value], i) => `**${i + 1}.** <@${userId}> — **${value} Renown**`).join("\n") : "No current House member has earned Renown yet.";
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(house.color || 0xd4af37).setTitle(`${house.name} · House Chronicle`).setThumbnail(interaction.guild.iconURL())
      .addFields(
        { name: "House Record", value: `**Current House Points:** ${points.scores[house.id] ?? 0}\n**Season Victories:** ${seasonWins}\n**Completed House Quests:** ${questWins}\n**Major Event Placements:** ${placements}`, inline: false },
        { name: "Notable Current Members", value: notableText },
        { name: "Recent History", value: history.slice(0, 1024) },
      ).setFooter({ text: `Page ${page}/${pages} · ${entries.length} historical record${entries.length === 1 ? "" : "s"}` })] });
  },
};
