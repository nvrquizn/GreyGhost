import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/command.js";
import { acceptDuel, cancelDuel, challengeDuel, declineDuel, getDuel, listMemberDuels } from "../combat/store.js";
import { getDuelAllowance } from "../economy/store.js";
import { recordFestivalActivity } from "../festivals/store.js";

function duelError(error: unknown): string {
  const code = (error as Error).message;
  if (code === "DUEL_SELF") return "You cannot challenge yourself to a duel.";
  if (code === "CHARACTER_REQUIRED") return "Both duelists need Realm characters first.";
  if (code === "DUEL_PENDING_EXISTS") return "There is already a pending duel between those two characters.";
  if (code === "DUEL_NOT_FOUND") return "That duel could not be found.";
  if (code === "DUEL_NOT_OPPONENT") return "Only the challenged opponent can do that.";
  if (code === "DUEL_NOT_CHALLENGER") return "Only the challenger can cancel that duel.";
  if (code === "DUEL_NOT_PENDING") return "That duel is no longer awaiting a response.";
  if (code === "DUEL_WEEK_LIMIT") return "One of the duelists has already completed **5 duels this week**.";
  if (code === "DUEL_OPPONENT_ALREADY_FOUGHT") return "You have already dueled each other this week. Weekly training duels must be against different opponents.";
  return "Grey Ghost could not resolve that duel.";
}

export const duelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("duel")
    .setDescription("Challenge another Realm character to a training duel.")
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("challenge").setDescription("Challenge another member to a duel.")
      .addUserOption((option) => option.setName("opponent").setDescription("The member you wish to challenge.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("accept").setDescription("Accept a pending duel and fight it immediately.")
      .addIntegerOption((option) => option.setName("duel-id").setDescription("Duel number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("decline").setDescription("Decline a pending duel.")
      .addIntegerOption((option) => option.setName("duel-id").setDescription("Duel number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel a duel you challenged someone to.")
      .addIntegerOption((option) => option.setName("duel-id").setDescription("Duel number.").setMinValue(1).setRequired(true)))
    .addSubcommand((sub) => sub.setName("status").setDescription("View your weekly duel allowance and recent duels.")),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "challenge") {
        const opponent = interaction.options.getUser("opponent", true);
        if (opponent.bot) {
          await interaction.reply({ content: "You cannot challenge a bot to a Realm duel.", flags: MessageFlags.Ephemeral });
          return;
        }
        const duel = await challengeDuel(interaction.guildId, interaction.user.id, opponent.id);
        await interaction.reply({ content: `<@${opponent.id}>, <@${interaction.user.id}> challenges you to **Duel #${duel.id}**. Use \`/duel accept duel-id:${duel.id}\` or \`/duel decline duel-id:${duel.id}\`.` });
        return;
      }
      if (sub === "status") {
        const allowance = await getDuelAllowance(interaction.guildId, interaction.user.id);
        const recent = (await listMemberDuels(interaction.guildId, interaction.user.id)).slice(0, 8);
        const lines = recent.map((duel) => {
          const other = duel.challengerId === interaction.user.id ? duel.opponentId : duel.challengerId;
          const outcome = duel.status === "completed" ? (duel.winnerId === interaction.user.id ? "Won" : "Lost") : duel.status;
          return `#${duel.id} · <@${other}> · **${outcome}**`;
        });
        await interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(0x8b6f47)
          .setTitle("Dueling Record")
          .setDescription(lines.join("\n") || "No duels recorded yet.")
          .addFields({ name: "Weekly allowance", value: `**${allowance.used}/5** completed · **${allowance.remaining}** remaining` })
          .setFooter({ text: "Each completed duel trains both characters; winners earn 2 Renown and losers earn 1." })], flags: MessageFlags.Ephemeral });
        return;
      }
      const duelId = interaction.options.getInteger("duel-id", true);
      if (sub === "accept") {
        const result = await acceptDuel(interaction.guildId, duelId, interaction.user.id);
        const duel = result.duel;
        await Promise.all([duel.winnerId, duel.loserId].filter(Boolean).map((id) => recordFestivalActivity(interaction.guildId, id!, "duel").catch(() => undefined)));
        await interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(0xb87333)
          .setTitle(`Duel #${duel.id} · The Bout Is Decided`)
          .setDescription(`<@${duel.challengerId}> **${duel.challengerScore}** vs **${duel.opponentScore}** <@${duel.opponentId}>\n\n🏆 <@${duel.winnerId}> wins the duel.`)
          .addFields(
            { name: "Training gained", value: `<@${duel.winnerId}> trained **${result.winnerStat} +1**.\n<@${duel.loserId}> trained **${result.loserStat} +1**.` },
            { name: "Renown", value: `<@${duel.winnerId}> **+2** · <@${duel.loserId}> **+1**` },
          )] });
        return;
      }
      if (sub === "decline") {
        const duel = await declineDuel(interaction.guildId, duelId, interaction.user.id);
        await interaction.reply({ content: `Duel #${duel.id} was declined.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const duel = await cancelDuel(interaction.guildId, duelId, interaction.user.id);
      await interaction.reply({ content: `Duel #${duel.id} was cancelled.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await interaction.reply({ content: duelError(error), flags: MessageFlags.Ephemeral });
    }
  },
};
