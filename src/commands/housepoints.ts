import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Role,
} from "discord.js";
import type { Command } from "../types/command.js";
import {
  changeHousePoints,
  getGuildSettings,
  getHousePoints,
} from "../services/guild-settings.js";
import { refreshStatsDashboard } from "../stats/dashboard.js";
import { renderHouseStandings } from "../housepoints/standings.js";

function canManageServer(interaction: {
  memberPermissions: { has(permission: bigint): boolean } | null;
}): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export const housePointsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("housepoints")
    .setDescription("Manage and view the contest between the Great Houses.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("standings").setDescription("View the current House standings."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("award")
        .setDescription("Award points to a House.")
        .addRoleOption((option) =>
          option.setName("house").setDescription("The House receiving the points.").setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("points")
            .setDescription("The number of points to award.")
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Why the House earned these points.")
            .setMaxLength(200)
            .setRequired(true),
        )
        .addUserOption((option) =>
          option.setName("member").setDescription("Optional member credited for earning the points."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deduct")
        .setDescription("Deduct points from a House.")
        .addRoleOption((option) =>
          option.setName("house").setDescription("The House losing the points.").setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("points")
            .setDescription("The number of points to deduct.")
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Why the points were deducted.")
            .setMaxLength(200)
            .setRequired(true),
        )
        .addUserOption((option) =>
          option.setName("member").setDescription("Optional member connected to the deduction."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("history")
        .setDescription("View recent House Point changes.")
        .addRoleOption((option) =>
          option.setName("house").setDescription("Optionally show changes for one House."),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "standings") {
      const embed = await renderHouseStandings(interaction.guild);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    const configuredHouseRoleIds = new Set(
      settings.selfRolePanels?.houses?.roles.map((entry) => entry.roleId) ?? [],
    );
    const selectedHouse = interaction.options.getRole("house") as Role | null;
    if (selectedHouse && !configuredHouseRoleIds.has(selectedHouse.id)) {
      await interaction.reply({
        content: `${selectedHouse} is not configured in the **House Allegiance** panel.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "history") {
      const state = await getHousePoints(interaction.guildId);
      const transactions = state.transactions
        .filter((transaction) => !selectedHouse || transaction.houseRoleId === selectedHouse.id)
        .slice(-10)
        .reverse();
      const description = transactions.length
        ? transactions
            .map((transaction) => {
              const amount = transaction.delta > 0 ? `+${transaction.delta}` : transaction.delta;
              const credited = transaction.memberId ? ` · <@${transaction.memberId}>` : "";
              return `<t:${Math.floor(transaction.createdAt / 1000)}:R> · <@&${transaction.houseRoleId}> · **${amount}**\n${transaction.reason}${credited}\n*Recorded by <@${transaction.staffId}> · ${transaction.id}*`;
            })
            .join("\n\n")
        : "No House Point changes have been recorded yet.";
      const embed = new EmbedBuilder()
        .setColor(0x9da8b5)
        .setTitle(selectedHouse ? `${selectedHouse.name} · Point History` : "House Point History")
        .setDescription(description.slice(0, 4096))
        .setFooter({ text: "Showing the 10 most recent changes" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (!canManageServer(interaction)) {
      await interaction.reply({
        content: "You need **Manage Server** to award or deduct House Points.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!selectedHouse) return;

    const points = interaction.options.getInteger("points", true);
    const reason = interaction.options.getString("reason", true).trim();
    const creditedMember = interaction.options.getUser("member");
    const delta = subcommand === "award" ? points : -points;

    let changed;
    try {
      changed = await changeHousePoints(interaction.guildId, {
        houseRoleId: selectedHouse.id,
        delta,
        reason,
        memberId: creditedMember?.id,
        staffId: interaction.user.id,
      });
    } catch (error) {
      if ((error as Error).message === "INSUFFICIENT_HOUSE_POINTS") {
        const current = (await getHousePoints(interaction.guildId)).scores[selectedHouse.id] ?? 0;
        await interaction.reply({
          content: `${selectedHouse} only has **${current}** points, so **${points}** cannot be deducted.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      throw error;
    }

    const embed = new EmbedBuilder()
      .setColor(delta > 0 ? 0x57a773 : 0xc44d56)
      .setTitle(delta > 0 ? "House Points Awarded" : "House Points Deducted")
      .setDescription(
        `${selectedHouse} ${delta > 0 ? "earned" : "lost"} **${points}** point${points === 1 ? "" : "s"}.`,
      )
      .addFields(
        { name: "Reason", value: reason },
        { name: "New Total", value: `**${changed.total}** points`, inline: true },
        ...(creditedMember
          ? [{ name: "Credited Member", value: `${creditedMember}`, inline: true }]
          : []),
      )
      .setFooter({ text: `Recorded by ${interaction.user.username} · ${changed.transaction.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    void refreshStatsDashboard(interaction.guild).catch((error) => {
      console.error(`Could not refresh House standings for ${interaction.guildId}:`, error);
    });
  },
};
