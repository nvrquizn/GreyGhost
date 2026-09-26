import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { claimPrizeChoices, pendingPrizeText } from "../events-manager/prizes.js";

export const prizeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("prize")
    .setDescription("Claim Admirer-role prizes earned from competitive events.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("choose").setDescription("Choose one or two Admirer roles from your pending prize.")
      .addRoleOption((option) => option.setName("first").setDescription("Your first Admirer role choice.").setRequired(true))
      .addRoleOption((option) => option.setName("second").setDescription("Your second Admirer role choice, when your prize allows two.")))
    .addSubcommand((sub) => sub.setName("view").setDescription("View your pending prize choices.")),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "view") {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle("Pending Event Prizes").setDescription(await pendingPrizeText(interaction.guild, interaction.user.id))], flags: MessageFlags.Ephemeral });
      return;
    }
    const first = interaction.options.getRole("first", true);
    const second = interaction.options.getRole("second");
    try {
      const result = await claimPrizeChoices(interaction.guild, interaction.user.id, [first, ...(second ? [second] : [])]);
      await interaction.reply({ content: `Prize claimed from **${result.package.title}**: ${result.awarded.map((role) => role.toString()).join(", ")}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      const code = (error as Error).message;
      const message = code === "NO_PENDING_PRIZE" ? "You have no pending Admirer-role choices."
        : code === "INVALID_PRIZE_COUNT" ? "That prize does not allow that many role choices."
          : code === "INVALID_ADMIRER_ROLE" ? "Choose a role from Grey Ghost's approved Admirer-role prize pool."
            : code === "PRIZE_ROLE_OWNED" ? "Choose an Admirer role you do not already have."
              : code === "PRIZE_ROLE_UNMANAGEABLE" ? "Grey Ghost cannot assign one of those roles. Check the role hierarchy."
                : "Grey Ghost could not award that prize.";
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  },
};
