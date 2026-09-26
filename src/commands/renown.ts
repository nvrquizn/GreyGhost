import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { changeRenown, getEconomyPlayer, renownLeaderboard, renownTitle } from "../economy/store.js";

export const renownCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("renown")
    .setDescription("View or administer Realm Renown.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("view").setDescription("View a character's Renown.")
      .addUserOption((option) => option.setName("user").setDescription("Member to view; defaults to you.")))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("View the most renowned Realm characters."))
    .addSubcommand((sub) => sub.setName("grant").setDescription("Grant Renown to a member.")
      .addUserOption((option) => option.setName("user").setDescription("Recipient.").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Positive Renown amount.").setMinValue(1).setMaxValue(1000).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "leaderboard") {
      const rows = await renownLeaderboard(interaction.guildId, 10);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle("Realm Renown").setDescription(rows.length ? rows.map((row, i) => `**${i + 1}.** <@${row.userId}> · **${row.renown}** · ${renownTitle(row.renown)}`).join("\n") : "No characters have earned Renown yet.")] });
      return;
    }
    if (sub === "grant") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Only server managers may grant Renown directly.", flags: MessageFlags.Ephemeral });
        return;
      }
      const user = interaction.options.getUser("user", true);
      try {
        const player = await changeRenown(interaction.guildId, user.id, interaction.options.getInteger("amount", true));
        await interaction.reply({ content: `${user} now has **${player.character.renown} Renown** (${renownTitle(player.character.renown)}).`, flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.reply({ content: "That member needs a Realm character first.", flags: MessageFlags.Ephemeral });
      }
      return;
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const player = await getEconomyPlayer(interaction.guildId, user.id);
    if (!player) {
      await interaction.reply({ content: "That member has not created a Realm character.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xc9a96e).setTitle(`${player.character.name} · Renown`).setDescription(`${user}\n\n**${player.character.renown} Renown** · ${renownTitle(player.character.renown)}`)] });
  },
};
