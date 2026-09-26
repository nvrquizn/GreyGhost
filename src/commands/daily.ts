import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { claimDaily, trainDaily, type CharacterStat } from "../economy/store.js";

function cooldownMessage(error: Error & { readyAt?: number }, label: string): string {
  return error.readyAt ? `${label} will be ready again <t:${Math.floor(error.readyAt / 1000)}:R>.` : `${label} is still on cooldown.`;
}

export const dailyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim daily coin or train your character.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("claim").setDescription("Claim 2–5 daily coins."))
    .addSubcommand((sub) => sub.setName("train").setDescription("Train one character stat once per day.")
      .addStringOption((option) => option.setName("stat").setDescription("Stat to train.").setRequired(true)
        .addChoices(
          { name: "Health", value: "health" },
          { name: "Damage", value: "damage" },
          { name: "Resistance", value: "resistance" },
        ))),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "claim") {
        const { player, reward } = await claimDaily(interaction.guildId, interaction.user.id);
        await interaction.reply({ content: `Grey Ghost brings you **${reward} coins** from the Realm. You now hold **${player.coins}**.` });
        return;
      }
      const stat = interaction.options.getString("stat", true) as CharacterStat;
      const player = await trainDaily(interaction.guildId, interaction.user.id, stat);
      await interaction.reply({ content: `Training complete. **${stat[0]!.toUpperCase()}${stat.slice(1)}** rises to **${player.character[stat]}**.` });
    } catch (error) {
      const typed = error as Error & { readyAt?: number };
      if (typed.message === "CHARACTER_REQUIRED") {
        await interaction.reply({ content: "Create your Realm character first with `/character create`.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (typed.message === "DAILY_COOLDOWN") {
        await interaction.reply({ content: cooldownMessage(typed, "Your daily coin"), flags: MessageFlags.Ephemeral });
        return;
      }
      if (typed.message === "TRAINING_COOLDOWN") {
        await interaction.reply({ content: cooldownMessage(typed, "Your training"), flags: MessageFlags.Ephemeral });
        return;
      }
      throw error;
    }
  },
};
