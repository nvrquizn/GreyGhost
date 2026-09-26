import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { awardCoins } from "../economy/store.js";
import {
  getTavernPlayer,
  recordTavernGame,
  TAVERN_DAILY_COIN_CAP,
  type TavernGame,
} from "../tavern/store.js";

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

function cooldownText(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.message !== "TAVERN_COOLDOWN") return undefined;
  const readyAt = (error as Error & { readyAt?: number }).readyAt;
  return readyAt ? `That game needs a little time before another round. Try again <t:${Math.floor(readyAt / 1000)}:R>.` : "That game is still cooling down.";
}

async function award(interaction: Parameters<Command["execute"]>[0], game: TavernGame, won: boolean, score: number, reward: number) {
  try {
    const result = await recordTavernGame(interaction.guildId!, interaction.user.id, game, won, score, reward);
    if (result.reward > 0) await awardCoins(interaction.guildId!, interaction.user.id, result.reward, `Tavern · ${game}`);
    return result;
  } catch (error) {
    const text = cooldownText(error);
    if (text) {
      await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
      return null;
    }
    throw error;
  }
}

export const tavernCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("tavern")
    .setDescription("Pass the time with games at the tavern.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand.setName("dice").setDescription("Play a harmless round of dice against Grey Ghost."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("darts").setDescription("Throw three darts and try to beat the tavern mark."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cups")
        .setDescription("Guess which cup hides the dragon token.")
        .addIntegerOption((option) =>
          option.setName("cup").setDescription("Choose cup 1, 2, or 3.").setMinValue(1).setMaxValue(3).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("View your tavern game record."),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "stats") {
      const player = await getTavernPlayer(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor(0x7a4b2a)
        .setTitle("The Tavern · Your Record")
        .setDescription("Tavern games never require a wager. Coin rewards are small, fixed prizes and are capped each day.")
        .addFields(
          { name: "Dice", value: player ? `${player.dice.won}/${player.dice.played} wins` : "0/0 wins", inline: true },
          { name: "Darts", value: player ? `${player.darts.won}/${player.darts.played} wins · best ${player.darts.best}` : "0/0 wins · best 0", inline: true },
          { name: "Cups", value: player ? `${player.cups.won}/${player.cups.played} finds` : "0/0 finds", inline: true },
          { name: "Lifetime tavern coin", value: `${player?.lifetimeCoinsWon ?? 0} coin`, inline: true },
          { name: "Daily reward cap", value: `${TAVERN_DAILY_COIN_CAP} coin`, inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "dice") {
      const yours = rollDie(6) + rollDie(6);
      const ghost = rollDie(6) + rollDie(6);
      const won = yours > ghost;
      const result = await award(interaction, "dice", won, yours, won ? 1 : 0);
      if (!result) return;
      const outcome = yours === ghost ? "The round is a draw." : won ? "You take the round." : "Grey Ghost takes the round.";
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x7a4b2a)
          .setTitle("Tavern Dice")
          .setDescription(`You rolled **${yours}**. Grey Ghost rolled **${ghost}**.\n\n${outcome}${result.reward ? `\n\n**Prize:** +${result.reward} coin` : ""}`)
          .setFooter({ text: "No wagers · 30-minute cooldown per game" })],
      });
      return;
    }

    if (subcommand === "darts") {
      const throws = [rollDie(20), rollDie(20), rollDie(20)];
      const score = throws.reduce((sum, value) => sum + value, 0);
      const won = score >= 36;
      const result = await award(interaction, "darts", won, score, won ? 1 : 0);
      if (!result) return;
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x7a4b2a)
          .setTitle("Tavern Darts")
          .setDescription(`Your throws: **${throws.join(" · ")}**\nTotal: **${score}**\n\n${won ? "You beat the tavern mark." : "The tavern mark stands at 36."}${result.reward ? `\n\n**Prize:** +${result.reward} coin` : ""}`)
          .setFooter({ text: "No wagers · 30-minute cooldown per game" })],
      });
      return;
    }

    const chosen = interaction.options.getInteger("cup", true);
    const hidden = rollDie(3);
    const won = chosen === hidden;
    const result = await award(interaction, "cups", won, won ? 1 : 0, won ? 1 : 0);
    if (!result) return;
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x7a4b2a)
        .setTitle("The Three Cups")
        .setDescription(`You chose **Cup ${chosen}**. The dragon token was beneath **Cup ${hidden}**.\n\n${won ? "Found it." : "Better luck next round."}${result.reward ? `\n\n**Prize:** +${result.reward} coin` : ""}`)
        .setFooter({ text: "No wagers · 30-minute cooldown per game" })],
    });
  },
};
