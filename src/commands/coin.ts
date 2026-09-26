import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { getEconomyPlayer } from "../economy/store.js";

export const coinCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("coin")
    .setDescription("View your coin purse and ledger.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("balance").setDescription("View your current coin balance."))
    .addSubcommand((sub) => sub.setName("history").setDescription("View your recent coin transactions.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const player = await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) {
      await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.options.getSubcommand() === "balance") {
      await interaction.reply({ content: `You hold **${player.coins} coins**.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const rows = player.coinHistory.slice(-10).reverse().map((entry) => {
      const sign = entry.amount > 0 ? "+" : "";
      return `<t:${Math.floor(entry.createdAt / 1000)}:d> · **${sign}${entry.amount}** · ${entry.reason}`;
    });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xb8c2cc).setTitle("Coin Ledger").setDescription(rows.join("\n") || "No transactions yet.").setFooter({ text: `Current purse: ${player.coins} coins` })], flags: MessageFlags.Ephemeral });
  },
};
