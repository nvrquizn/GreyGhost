import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { countInventoryItem } from "../economy/catalogue.js";
import { clearExpiredInjury, getEconomyPlayer, useBandage } from "../economy/store.js";

export const recoveryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("recovery")
    .setDescription("Check or treat your joust injury.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("status").setDescription("Check your injury and bandages."))
    .addSubcommand((sub) => sub.setName("bandage").setDescription("Use one Field Bandage to clear your current injury.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();
    const player = await clearExpiredInjury(interaction.guildId, interaction.user.id) ?? await getEconomyPlayer(interaction.guildId, interaction.user.id);
    if (!player) { await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral }); return; }

    if (subcommand === "status") {
      const bandages = countInventoryItem(player.inventory, "field-bandage");
      const injury = player.injury
        ? `**${player.injury.severity}** from ${player.injury.reason}${player.injury.clearsAt ? `\nClears <t:${Math.floor(player.injury.clearsAt / 1000)}:R>.` : ""}`
        : "No current injury.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8aa0aa).setTitle(`${player.character.name} · Recovery`).addFields({ name: "Injury", value: injury }, { name: "Field Bandages", value: String(bandages), inline: true })], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await useBandage(interaction.guildId, interaction.user.id);
      await interaction.reply({ content: "A Field Bandage was used. Your current injury has been cleared.", flags: MessageFlags.Ephemeral });
    } catch (error) {
      const code = (error as Error).message;
      if (code === "NOT_INJURED") { await interaction.reply({ content: "You do not currently have a joust injury.", flags: MessageFlags.Ephemeral }); return; }
      if (code === "BANDAGE_REQUIRED") { await interaction.reply({ content: "You need a **Field Bandage**. Buy one with `/buy item:Field Bandage` or ask staff to grant one.", flags: MessageFlags.Ephemeral }); return; }
      throw error;
    }
  },
};
